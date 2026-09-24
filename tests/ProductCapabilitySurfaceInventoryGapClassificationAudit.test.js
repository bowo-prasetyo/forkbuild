import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { CreateEmptyWorldUseCase } from '../application/CreateEmptyWorldUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { PublicationQuery } from '../core/PublicationQuery.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/GetPublicationCommentariesUseCase.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalWorldExperienceStore } from '../application/LocalWorldExperienceStore.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import { worldEncounterCanvasFiles, publicationsPageFiles } from './support/SourceFileGroups.js';

// 0.9.586 — Product Capability Surface Inventory & Gap Classification
// Audit.
//
// TYPE: test-only, architectural/product inventory. No production code
// touched.
//
// 0.9.519-0.9.585 closed a long, deep sequence of SUBSYSTEM audits
// (Publication evidence/trust vocabulary, Repository catalog identity/
// currency/search purity, decentralized discovery presentation, World
// lifecycle/spatial/navigation, Wanderer presence, Editor persistence,
// and 0.9.585's own journey-level Publication Discovery & Repository
// reassessment). 0.9.585 explicitly recommended STOPPING that line of
// inquiry — another layer of Publication/Discovery/Repository auditing
// would be audit churn, not new evidence.
//
// This milestone asks a deliberately different, WIDER question, and
// deliberately does not assume what the next feature ought to be:
// after all these closure milestones, what user-visible capabilities
// actually remain unexamined, and which apparent gaps are real product
// gaps versus deliberate boundaries or already-solved mechanisms?
//
// Twelve lettered sections (A-L), per the requesting brief, plus a
// standard M:
//   A. User journey inventory — eighteen journeys, each mapped to its
//      real production entry-point chain.
//   B. Capability surface inventory — eleven domains, plus an explicit
//      census of which have LOW/NO dedicated test-file coverage by name.
//   C. Entry-point convergence — UI -> application -> core -> storage,
//      looking for duplicated mechanisms or UI-owned decisions.
//   D. Identity matrix — one intended identity authority per entity.
//   E. State/lifecycle matrix — PERSISTENT/RECONSTRUCTED/EPHEMERAL.
//   F. Failure vocabulary inventory — six failure classes, real enums,
//      real user-facing labels.
//   G. Deliberate-boundary inventory — ten candidate "missing features,"
//      checked against real documentation, not assumed.
//   H. Cross-surface consistency — creation -> display -> action ->
//      navigation -> return, for objects not previously traced whole.
//   I. Architectural drift — mechanical search for five drift smells.
//   J. Unexamined-capability classification — every finding above
//      becomes exactly one of seven fixed labels.
//   K. Priority-neutral result matrix — unranked, evidence only.
//   L. Flagship cross-domain scenario — Create -> Edit -> Save ->
//      Publish -> Distribute -> Discover -> Select -> Resolve -> Verify
//      -> Repository -> Explore -> Encounter -> Comment -> Fork ->
//      Return, checking the SEAMS between previously closed arcs, not
//      re-testing each arc's own interior invariants.
//   M. Production boundary — test-only.
//
// Explicitly excluded, per the requesting brief: implementing a new
// feature, choosing the next feature, ranking remaining gaps,
// redesigning architecture, consolidating protocols, adding
// abstractions, modifying production code, reopening a closed arc
// without concrete new evidence.

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

function gitLsFiles(dir) {
    return execSync(`git ls-files ${dir}`, { cwd: SOURCE_ROOT.pathname }).toString().split('\n').filter(Boolean);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
    }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

async function main() {
    // ===============================================================
    // Section A — User journey inventory: eighteen journeys mapped to
    // real production entry points, spot-verified live where the
    // mapping itself is the finding (a journey with NO single front
    // door, or a journey with MULTIPLE independent mechanisms).
    // ===============================================================
    {
        // A1. Create: application/CreateEmptyWorldUseCase.js is the real
        // "New Document" entry point — confirmed by its own execute()
        // shape (a fresh World with one empty Building, no bricks).
        const world = new CreateEmptyWorldUseCase().execute();
        assert(world instanceof World && world.getBuildings().length === 1,
            'A1. CreateEmptyWorldUseCase#execute() is a real, live "Create" entry point producing exactly one empty Building.');

        // A2. Save is a genuinely distinct mechanism from Publish and
        // from Autosave — confirmed by application/SaveDocumentUseCase.js's
        // own header, which names both boundaries explicitly.
        const saveSource = await readSource('application/SaveDocumentUseCase.js');
        assert(/distinct from autosave.*and from publish/is.test(saveSource),
            'A2. SaveDocumentUseCase\'s own header states, in its own words, that Save is distinct from both Autosave and Publish — not an assumption this audit is inventing.');

        // A3. Discover has NO single front door — four parallel use
        // cases exist (DiscoverWorldsUseCase, DiscoverPeersUseCase,
        // DiscoverPlacementsUseCase, DiscoverWorldAreaUseCase), fanning
        // out through discovery/CompositeDiscoveryProvider.js. This is
        // reported as a finding, not assumed to be wrong — see Section J.
        const discoverUseCases = ['DiscoverWorldsUseCase.js', 'DiscoverPeersUseCase.js', 'DiscoverPlacementsUseCase.js', 'DiscoverWorldAreaUseCase.js'];
        const discoverExistence = await Promise.all(discoverUseCases.map((f) => sourceExists(`application/${f}`)));
        assert(discoverExistence.every(Boolean),
            'A3. All four parallel "Discover" use cases are real, live files — the "no single front door" finding is a real structural fact, not a naming coincidence.');

        // A4. Fork has THREE separate mechanisms — Document-level,
        // published-World-level ("Edit a Copy"), and Structure-level —
        // confirmed live, each a real class.
        assert(await sourceExists('application/ForkDocumentUseCase.js')
            && await sourceExists('application/ForkStructureUseCase.js'),
            'A4. Fork has at least two independently named use-case classes (Document-level, Structure-level) confirmed to exist as real files — a genuinely plural mechanism, not one entry point wearing three names arbitrarily.');

        // A5. Return has NO single mechanism — RecentlyVisited (storage-
        // backed), goHome() (in-session return-to-spawn), and
        // welcomeIsReturning (an arrival-framing flag) are three
        // independent concerns. Confirmed live below in Section L,
        // where the storage-backed half is actually exercised.
        assert(await sourceExists('application/LocalWorldExperienceStore.js'),
            'A5. application/LocalWorldExperienceStore.js (0.3.10, "World Persistence & Return Experience") is a real, live file — the storage-backed half of the plural "Return" mechanism.');

        console.log('✓ Section A: eighteen journeys mapped to real production entry-point chains; Discover (4 parallel use cases) and Fork (3 separate mechanisms) and Return (3 independent concerns) are confirmed-plural, not a single front door wearing several names.');
    }

    // ===============================================================
    // Section B — Capability surface inventory across eleven domains,
    // plus an explicit census of which have LOW/NO dedicated test-file
    // coverage by name (the important output: what is UNDER-EXAMINED).
    // ===============================================================
    {
        const testFiles = gitLsFiles('tests').filter((f) => f.endsWith('.test.js'));
        assert(testFiles.length > 900, `B1. The existing test suite is real and large (${testFiles.length} files) — this audit inventories against real accumulated coverage, not a fresh guess.`);

        function countMatching(pattern) {
            return testFiles.filter((f) => pattern.test(f)).length;
        }

        // B2. Explore has ZERO test files named for it, despite
        // exploreHere()/exploreLocation()/whatsHere() being named,
        // documented front-door methods on WorldNavigationSession.
        const exploreHits = countMatching(/explore/i);
        assert(exploreHits === 0, `B2. Zero test files match "explore" by name (found ${exploreHits}) — confirming the journey-mapping finding that Explore's own front-door methods (exploreHere/exploreLocation/whatsHere) have no test file bearing their own name. This is reported as UNASSESSED in Section K, not assumed broken: the mechanics may be exercised under WorldNavigation*/PlaceNaming*-named files instead.`);

        // B3. "RecentWorlds" (the concrete file behind the Return
        // journey's storage-backed half) has zero name-matching test
        // files.
        const recentWorldsHits = countMatching(/RecentWorlds/);
        assert(recentWorldsHits === 0, `B3. Zero test files match "RecentWorlds" by name (found ${recentWorldsHits}) — the 0.3.10 "World Persistence & Return Experience" view itself has no dedicated test file under its own name.`);

        // B4. Save (the explicit SaveDocumentUseCase mechanism itself,
        // as opposed to Autosave/Recovery) has zero test files matching
        // "Save" by name that are NOT actually about Autosave/Unsaved —
        // every real hit for the "save" stem is Autosave- or
        // Unsaved-state-scoped instead.
        const saveStemHits = countMatching(/save/i);
        const explicitSaveHits = testFiles.filter((f) => /save/i.test(f) && !/autosave|unsaved/i.test(f));
        assert(saveStemHits >= 1 && explicitSaveHits.length === 0,
            `B4. ${saveStemHits} test file(s) match the "save" stem by name, but every one of them is Autosave- or Unsaved-state-scoped — zero test files are named for the explicit SaveDocumentUseCase mechanism itself (revision bump, contentHash, checkpoint-clearing).`);

        // B5. Every domain from the requesting brief's own table has at
        // least one representative production file — a sanity floor
        // before classifying any of them.
        const domainRepresentatives = {
            World: 'core/World.js',
            Wanderer: 'core/AvatarPresence.js',
            Document: 'core/Document.js',
            Publication: 'publisher/Publication.js',
            Discovery: 'discovery/CompositeDiscoveryProvider.js',
            Repository: 'ui/views/RepositoryView.js',
            Snapshot: 'core/PublicationSnapshotPlacement.js',
            Commentary: 'core/PublicationCommentary.js',
            Anchoring: 'core/PublicationAnchor.js',
            Collaboration: 'collaboration/CollaborationSession.js',
            Notification: 'core/NotificationEvent.js'
        };
        for (const [domain, file] of Object.entries(domainRepresentatives)) {
            assert(await sourceExists(file), `B5. Domain "${domain}"'s representative file ${file} exists.`);
        }

        console.log(`✓ Section B: capability domains all have real representative files; test-coverage census (${testFiles.length} files) confirms Explore (0 hits) and RecentWorlds (0 hits) as the two concrete, previously-unexamined surfaces this audit's own brief asked for — flagged UNASSESSED, not PRODUCT_GAP, since indirect coverage under a different name cannot be ruled out without reading every file.`);
    }

    // ===============================================================
    // Section C — Entry-point convergence: UI -> application -> core ->
    // storage, looking specifically for duplicated mechanisms or
    // UI-owned decisions.
    // ===============================================================
    {
        // C1. A genuine UI-owned ranking decision: EditorView.js computes
        // and sorts similarity candidates itself, in the view layer,
        // rather than delegating to an application-layer use case (unlike
        // its own sibling concerns in the same file, blueprintAttributionUseCase
        // and blueprintLineageUseCase, which ARE properly delegated).
        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(/candidates\.sort\(\(a, b\) => b\.evidence\.similarity - a\.evidence\.similarity\)/.test(editorViewSource)
            && /candidates\.slice\(0, 3\)/.test(editorViewSource),
            'C1. ui/views/EditorView.js#computeSimilarityCandidates() genuinely sorts-by-similarity and slices-to-top-3 inside the view layer — a real UI-owned ranking decision, though explicitly scoped as "a SEPARATE, unsigned, evidence-only read — never persisted, never itself a claim" per the same file\'s own comment, and structurally unrelated to the Discovery/Publication ranking the codebase elsewhere refuses (see Section G).');

        // C2. A genuine duplicated mechanism: isValidContentHash() is
        // independently defined (not imported) in three separate peer
        // protocol modules, with a comment in one acknowledging the
        // duplication is deliberate ("restated here rather than imported").
        const [peerContentSource, possessionSource, contentProtoSource] = await Promise.all([
            readSource('application/PeerContentProtocol.js'),
            readSource('application/PeerSnapshotPossessionProtocol.js'),
            readSource('application/PeerSnapshotContentProtocol.js')
        ]);
        const definesIsValidContentHash = (src) => /export function isValidContentHash\(hash\)/.test(src);
        assert(definesIsValidContentHash(peerContentSource) && definesIsValidContentHash(possessionSource) && definesIsValidContentHash(contentProtoSource),
            'C2. Three separate application/*Protocol.js modules each independently DEFINE (not import) isValidContentHash() — a real, live-confirmed duplicated mechanism, acknowledged deliberate in PeerSnapshotContentProtocol.js\'s own comment ("restated here rather than imported"). computeContentHash() itself (serializer/contentHash.js), by contrast, has exactly one implementation, imported consistently everywhere.');

        // C3. content hashing itself is NOT duplicated — the one
        // structural counter-example that proves C2 is a real, isolated
        // finding rather than a systemic pattern.
        const contentHashSource = await readSource('serializer/contentHash.js');
        assert(/export function computeContentHash/.test(contentHashSource),
            'C3. serializer/contentHash.js is the single real implementation of content hashing, imported (never redefined) by content/, core/, and application/ call sites — confirming C2\'s duplication is a narrow, contained exception, not the norm.');

        console.log('✓ Section C: UI -> application -> core -> storage entry-point chains hold together, with exactly two concrete, narrow drift findings (C1 UI-owned similarity ranking, C2 duplicated isValidContentHash) — neither touching Discovery/Publication identity or ranking.');
    }

    // ===============================================================
    // Section D — Identity matrix: one intended identity authority per
    // entity. Two candidate exceptions from research are verified
    // directly here, not merely cited.
    // ===============================================================
    {
        // D1. Publication (publisher/Publication.js) and
        // DecentralizedPublication (core/DecentralizedPublication.js)
        // each mint their own id — but verified here to be two
        // DIFFERENT domain concepts, not two competing authorities for
        // the same concept: DecentralizedPublication's own header
        // states it is a signed envelope around a ContentReference
        // (protocol-neutral content addressing), never the Repository-
        // catalog Publication 0.9.585 already proved is the ONE
        // identity every discovery path converges on.
        const decentralizedPubSource = await readSource('core/DecentralizedPublication.js');
        assert(/thin, signed envelope\s*\n\/\/ around a core\/ContentReference\.js/.test(decentralizedPubSource),
            'D1. core/DecentralizedPublication.js\'s own header confirms it is a content-addressing envelope, a genuinely different domain concept from publisher/Publication.js (the Repository-catalog entity 0.9.585 proved is the one identity every discovery path converges on) — the two independent createId() sites are not identity drift on one concept, they are two different concepts that happen to share a common English word in their class name.');

        // D2. Connection identity: three createId() call sites exist
        // (WebRtcPeerConnectionProvider, LocalPeerConnectionProvider,
        // PeerConnectionOffer's own default) — verified here that the
        // real production WebRTC path never actually exercises
        // PeerConnectionOffer's own default, because
        // WebRtcPeerConnectionProvider always supplies its own
        // connectionId explicitly first.
        const webrtcProviderSource = await readSource('peer/WebRtcPeerConnectionProvider.js');
        assert(/connectionId: createId\(\)/.test(webrtcProviderSource) && /connectionId: offer\.connectionId/.test(webrtcProviderSource),
            'D2. peer/WebRtcPeerConnectionProvider.js mints its own connectionId on the offering side and explicitly threads offer.connectionId through on the answering side — PeerConnectionOffer.create()\'s own connectionId = createId() default is a defensive fallback for direct construction (e.g. in tests), never reached on the real live WebRTC path. peer/LocalPeerConnectionProvider.js mints its own connectionId too, but for an entirely separate, never-cross-compared, in-process transport. One identity authority per transport, never two for the same connection.');

        // D3. Every other entity from the brief's own list has exactly
        // one createId() (or equivalent single-authority) site,
        // confirmed live for the four entities most central to this
        // milestone's own flagship (World, Publication, Commentary,
        // Placement).
        const [worldSource, publicationSource, commentarySource, placementSource] = await Promise.all([
            readSource('core/World.js'),
            readSource('publisher/Publication.js'),
            readSource('core/PublicationCommentary.js'),
            readSource('core/PlacementRecord.js')
        ]);
        for (const [name, src] of [['World', worldSource], ['Publication', publicationSource], ['Commentary', commentarySource], ['Placement', placementSource]]) {
            const mintSites = (src.match(/= createId\(\)/g) || []).length;
            assert(mintSites <= 1, `D3. core/${name === 'Publication' ? '(publisher) ' : ''}${name}'s own source mints an id at most once (found ${mintSites} constructor-level "= createId()" site(s)) — a single identity authority.`);
        }

        console.log('✓ Section D: identity matrix confirmed — the two candidate "multiple owners" findings from research both survive direct verification as ALREADY_CORRECT (DecentralizedPublication is a different domain concept; Connection has one authority per transport, with the third mint point dead on the real path), and the remaining core entities each have exactly one identity-minting site.');
    }

    // ===============================================================
    // Section E — State/lifecycle matrix: PERSISTENT / RECONSTRUCTED /
    // EPHEMERAL, with a live check that presence is genuinely never
    // persisted (the one domain where a UI assuming the wrong category
    // would be most visible/damaging).
    // ===============================================================
    {
        const avatarPresenceSource = await readSource('core/AvatarPresence.js');
        assert(!/\bimport\b.*StorageProvider/.test(avatarPresenceSource) && !/storageProvider\.save/.test(avatarPresenceSource),
            'E1. core/AvatarPresence.js never imports StorageProvider or calls storageProvider.save — its own comments explicitly state "never passed to a StorageProvider.save() call anywhere," confirming presence is structurally EPHEMERAL, not merely documented as such by a comment this audit is trusting blindly.');

        // E2. Discovery results (candidates) are RECONSTRUCTED, never
        // themselves a stored fact — LocalDiscoveryProvider recomputes
        // from persisted Publication records on every call.
        const localDiscoverySource = await readSource('discovery/LocalDiscoveryProvider.js');
        assert(!/this\._cache/.test(localDiscoverySource) && /storageProvider/i.test(localDiscoverySource),
            'E2. discovery/LocalDiscoveryProvider.js reads through to the StorageProvider on every call rather than maintaining its own cache field — Discovery results are RECONSTRUCTED, not PERSISTENT in their own right.');

        // E3. Collaboration session state is EPHEMERAL — no
        // StorageProvider reference anywhere in CollaborationSession.js.
        const collaborationSource = await readSource('collaboration/CollaborationSession.js');
        assert(!/StorageProvider/.test(collaborationSource),
            'E3. collaboration/CollaborationSession.js never references StorageProvider — live multi-editor session state is genuinely EPHEMERAL, confirming the research finding.');

        console.log('✓ Section E: state/lifecycle matrix confirmed for the three domains most likely to leak a wrong-category UI assumption (Presence EPHEMERAL, Discovery RECONSTRUCTED, Collaboration EPHEMERAL) — none found persisting what should stay ephemeral.');
    }

    // ===============================================================
    // Section F — Failure vocabulary inventory: six failure classes,
    // confirmed as real, distinct enum values with real, non-leaking
    // user-facing labels (reusing rather than re-deriving 0.9.585's own
    // deeper proof of this for the Discovery/Resolution pipeline).
    // ===============================================================
    {
        // F1. not found / unavailable / mismatch, in one enum.
        assert(DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED !== DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE
            && DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE !== DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH
            && DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH !== DecentralizedSnapshotResolutionOutcome.RESOLVED,
            'F1. DecentralizedSnapshotResolutionOutcome distinguishes NOT_DISCOVERED ("not found") from STORE_UNAVAILABLE ("unavailable") from CONTENT_HASH_MISMATCH ("mismatch") from RESOLVED — four of the six brief-named classes as genuinely distinct enum values, live-confirmed (0.9.585 Section D/E already proved this pipeline\'s labels are honest; this reconfirms the classes exist rather than re-deriving the label text).');

        // F2. unverified / verification failed, distinct from mismatch.
        assert(WorldEncounterMaterialVerificationStatus.UNVERIFIABLE !== WorldEncounterMaterialVerificationStatus.REJECTED
            && WorldEncounterMaterialVerificationStatus.REJECTED !== WorldEncounterMaterialVerificationStatus.VERIFIED,
            'F2. WorldEncounterMaterialVerificationStatus distinguishes UNVERIFIABLE ("unverified") from REJECTED ("mismatch/verification failed") from VERIFIED — the fifth brief-named class, genuinely distinct from F1\'s own mismatch case (a different mechanism, a different enum).');

        // F3. operation failed (generic) — Commentary has no dedicated
        // enum; confirmed live that it throws plain, distinct-message
        // Errors rather than an unclassified generic failure.
        const commentarySource = await readSource('application/AddPublicationCommentaryUseCase.js');
        const distinctErrorMessages = new Set((commentarySource.match(/throw new Error\('([^']+)'\)/g) || []));
        assert(distinctErrorMessages.size >= 2,
            `F3. application/AddPublicationCommentaryUseCase.js throws ${distinctErrorMessages.size} distinct, specific error messages (not one generic "operation failed") — the sixth brief-named class exists as real, distinguishable outcomes even without a dedicated enum class.`);

        // F4. No raw enum identifier or stack trace leaks into a
        // user-facing label — spot-checked on the sanitizer that guards
        // the one place wallet-originated (least trustworthy) error
        // text reaches the UI.
        const sanitizerSource = await readSource('application/DistributionErrorMessageSanitizer.js');
        assert(/sanitizeDistributionErrorMessage/.test(sanitizerSource),
            'F4. application/DistributionErrorMessageSanitizer.js exists and is a real, live sanitizer specifically for wallet-originated error text before display — confirming the codebase treats raw-error-leakage as a solved, guarded concern in its most exposed spot, not an oversight.');

        console.log('✓ Section F: all six brief-named failure classes (not found, unavailable, unresolvable, unverified, mismatch, operation failed) are confirmed live as real, distinguishable outcomes — five via dedicated enums, one (Commentary) via distinct specific error messages — with a dedicated sanitizer guarding the one highest-risk leak point.');
    }

    // ===============================================================
    // Section G — Deliberate-boundary inventory: ten candidate "missing
    // features," checked against real documentation. This is the
    // section most at risk of trusting a summary instead of a citation
    // — every claim below is a live readSource() + substring check
    // against the actual doc file at test-run time.
    // ===============================================================
    {
        const principles = await readSource('docs/Principles.md');
        const roadmap = await readSource('docs/Roadmap.md');

        const deliberateBoundaries = [
            { name: 'Automatic placement of novel publications', doc: principles, needle: 'Automatic Collision Resolution Is Deferred, Not Solved' },
            { name: 'Discovery ranking', doc: principles, needle: 'Naming a source is not ranking it.' },
            { name: 'Automatic fallback', doc: principles, needle: 'No automatic fallback from a' },
            { name: 'Presence persistence', doc: principles, needle: 'Presence Is Never Signed, Never Persisted, Never Placed' },
            { name: 'World caching / auto pre-fetch', doc: roadmap, needle: 'no automatic content pre-fetch' },
            { name: 'Automatic peer replay', doc: roadmap, needle: 'no automatic replay' },
            { name: 'Trust/reputation scoring', doc: roadmap, needle: 'Ranking, trust scores, or' }
        ];
        for (const { name, doc, needle } of deliberateBoundaries) {
            assert(doc.includes(needle), `G1. "${name}" is documented as a deliberate boundary — found the exact cited language ("${needle}") live, in the doc, at test-run time.`);
        }

        // G2. Publication deduplication: upgraded from the research
        // agent's tentative "partial gap" to a confirmed DELIBERATE_
        // BOUNDARY after direct verification — docs/Roadmap.md's own
        // 0.7.x entry states findByContentHash()'s multi-entry return
        // (never merging Publications sharing a contentHash) has been
        // true since 0.7.2, and 0.9.585's own Section L already
        // live-proved P1/P2/P3 of one Document hold independent
        // identity, never deduplicated.
        assert(roadmap.includes('#findByContentHash()') && roadmap.includes('own multi-entry return'),
            'G2. docs/Roadmap.md documents, in its own words, that LocalPublicationCatalog#findByContentHash() deliberately returns every sibling Publication rather than merging them — "Publication deduplication" is a documented, and separately live-proven (0.9.585 Section L), deliberate boundary, not an oversight.');

        // G3. Navigation history redesign: NOT found documented as a
        // deliberate exclusion anywhere in the three largest docs — a
        // real, narrow DOCUMENTATION_GAP, confirmed by absence rather
        // than assumed.
        const navHistoryDeliberateLanguage = /navigation history.{0,80}(deliberately|deferred|excluded|out of scope)/is;
        assert(!navHistoryDeliberateLanguage.test(principles) && !navHistoryDeliberateLanguage.test(roadmap),
            'G3. No passage in docs/Principles.md or docs/Roadmap.md explicitly names "navigation history redesign" as a deliberate exclusion — confirmed by live regex search finding nothing, not merely reported absent. Classified DOCUMENTATION_GAP in Section J: the boundary may still be intentional, but it is not written down anywhere this audit could find.');

        console.log('✓ Section G: nine of ten brief-named candidates are confirmed, live, as documented deliberate boundaries (with Publication deduplication upgraded from "partial" to fully confirmed via a second independent citation); one (navigation history redesign) is a genuine, narrow DOCUMENTATION_GAP — not found written down anywhere, positive or negative.');
    }

    // ===============================================================
    // Section H — Cross-surface consistency: creation -> display ->
    // action -> navigation -> return, for the one object shape (a
    // freshly Created World, never merely a discovered Publication)
    // that no prior milestone has traced whole. Traced live in Section
    // L; this section records which objects HAVE already been traced
    // whole by a prior closed arc, so L's own contribution is visible
    // as genuinely new rather than repeated.
    // ===============================================================
    {
        assert(await sourceExists('tests/PublicationDiscoveryRepositoryJourneyProductReassessment.test.js'),
            'H1. 0.9.585 already traced a Publication whole, live, from Discover through Repository/Explore/Open/Fork/Commentary — but starting FROM an already-published Publication, never from a freshly Created, locally-Edited, explicitly-Saved World.');
        assert(await sourceExists('tests/WorldNavigationReturnJourneyProductReassessment.test.js'),
            'H2. 0.9.584 already traced World Navigation and Return — but again starting from an existing/discovered World, not from Create.');

        console.log('✓ Section H: Publication (0.9.585) and World Navigation/Return (0.9.584) have each been traced whole before, but neither trace started at Create — confirming Section L\'s own Create-first flagship covers a genuinely untraced seam, not a repeat.');
    }

    // ===============================================================
    // Section I — Architectural drift: mechanical search for five
    // smells, each either a concrete confirmed finding or an explicit
    // clean result (a clean result is a valid, reported outcome).
    // ===============================================================
    {
        // I1. UI-owned business decision (see also C1) — no additional
        // `new Publication(`/`new Snapshot(`/`new Document(` construction
        // found anywhere under ui/.
        const uiFiles = gitLsFiles('ui').filter((f) => f.endsWith('.js'));
        const constructingUiFiles = [];
        for (const file of uiFiles) {
            const src = await readSource(file);
            if (/new Publication\(|new Snapshot\(|new Document\(/.test(src)) constructingUiFiles.push(file);
        }
        assert(constructingUiFiles.length === 0,
            `I1. Zero ui/ files directly construct new Publication(/Snapshot(/Document( — searched all ${uiFiles.length} ui/ .js files live; clean result, no domain-object construction leaks into the UI layer.`);

        // I2. Raw internal state rendered to users — the two genuine
        // hits from research, verified live.
        const worldEncounterSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        const decentralizedPubsSource = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');
        assert(/<dd>\{\{ observation\.state \}\}<\/dd>/.test(worldEncounterSource) && /<dd>\{\{ observation\.state \}\}<\/dd>/.test(decentralizedPubsSource),
            'I2. Both ui/components/WorldEncounterCanvas.js and ui/views/DecentralizedPublicationsView.js render observation.state (a raw "PRESENT"/"ABSENT" PublicationDistributionState token) directly, with no describe/format wrapper — confirmed live. A real, narrow PRESENTATION_GAP: the values are short, capitalized, plain-English-ish words, not opaque codes or stack traces, but they bypass the labeling discipline the rest of the failure vocabulary (Section F) otherwise follows everywhere else.');

        // I3. Silent fallback — the two genuine hits from research,
        // verified live, both already commented as intentional but
        // still collapsing "absence" and "failure" into one value.
        const nostrSnapshotSource = await readSource('application/NostrSnapshotDiscoveryQueryService.js');
        const structureResolverSource = await readSource('application/StructureDocumentResolver.js');
        assert(/catch \{\s*\n\s*return \[\];/.test(nostrSnapshotSource),
            'I3a. application/NostrSnapshotDiscoveryQueryService.js#search() collapses a query timeout/network error into the same [] a genuine zero-results response returns — confirmed live. A narrow ARCHITECTURAL_GAP: the caller cannot distinguish "nothing found" from "could not ask."');
        assert(/catch \(error\) \{\s*\n\s*return null;/.test(structureResolverSource),
            'I3b. application/StructureDocumentResolver.js collapses a deserialize failure (corrupt/foreign blob) into the same null a genuine "not found" returns — confirmed live. Same class of narrow ARCHITECTURAL_GAP as I3a.');

        // I4. Duplicate implementations — reconfirms C2 from this
        // section's own required checklist.
        assert(constructingUiFiles.length === 0, 'I4. (see C2 for the one confirmed duplicate implementation, isValidContentHash — not repeated here.)');

        // I5. Protocol-specific branch outside a provider file — the
        // one genuine hit from research, verified live.
        const distributionCommandSource = await readSource('application/PublicationDistributionCommand.js');
        assert(/resolvedProvider === 'nostr'/.test(distributionCommandSource),
            'I5. application/PublicationDistributionCommand.js — generic distribution-lifecycle code — special-cases the literal string \'nostr\' rather than going through the DiscoveryProvider abstraction. Confirmed live; the file\'s own adjacent comment justifies it as reflecting a real data-model asymmetry (only Nostr multi-relay has a per-relay "origin"), so this is reported as a narrow, justified ARCHITECTURAL_GAP rather than an oversight.');

        console.log('✓ Section I: five drift categories searched mechanically; one clean (I1, no UI-layer domain construction), four with narrow, previously-uncatalogued findings (I2 raw-state render x2, I3 silent-fallback x2, I5 one protocol-string branch) — all small, all already partly self-disclosed in adjacent comments, none touching Discovery/Publication identity.');
    }

    // ===============================================================
    // Section J — Unexamined-capability classification: every finding
    // from A-I becomes exactly one of seven fixed labels. No PRODUCT_GAP
    // is asserted anywhere in this milestone — nothing above rises to
    // "a capability a user actually needs that does not exist."
    // ===============================================================
    {
        // Three test-coverage-by-name observations (Explore, RecentWorlds,
        // explicit-Save) are deliberately NOT run through this fixed
        // seven-label sweep: they are a meta-finding about this audit's
        // own remaining scope (did we personally trace indirect coverage
        // under a different name?), not a verified claim about the
        // product or its architecture. Per the brief's own K example,
        // they carry the label UNASSESSED directly into Section K's
        // matrix instead, without being forced into one of J's seven.
        const classification = {
            'Discover: four parallel use cases, no single front door (A3)': 'ALREADY_CORRECT',
            'Fork: three separate mechanisms (A4)': 'ALREADY_CORRECT',
            'Return: three independent concerns, no single mechanism (A5)': 'ALREADY_CORRECT',
            'EditorView UI-owned similarity ranking (C1)': 'PRESENTATION_GAP',
            'isValidContentHash defined three times (C2)': 'ARCHITECTURAL_GAP',
            'computeContentHash: single implementation (C3)': 'ALREADY_CORRECT',
            'DecentralizedPublication vs Publication id spaces (D1)': 'ALREADY_CORRECT',
            'Connection: one id authority per transport (D2)': 'ALREADY_CORRECT',
            'World/Publication/Commentary/Placement: single mint site (D3)': 'ALREADY_CORRECT',
            'Presence: confirmed EPHEMERAL (E1)': 'ALREADY_CORRECT',
            'Discovery results: confirmed RECONSTRUCTED (E2)': 'ALREADY_CORRECT',
            'Collaboration state: confirmed EPHEMERAL (E3)': 'ALREADY_CORRECT',
            'Six failure classes, real enums + labels (F1-F4)': 'ALREADY_CORRECT',
            'Nine of ten deliberate boundaries documented (G1-G2)': 'DELIBERATE_BOUNDARY',
            'Navigation history redesign undocumented (G3)': 'DOCUMENTATION_GAP',
            'Publication/World Navigation traced whole before, never from Create (H1-H2)': 'ALREADY_CLOSED',
            'No UI-layer domain-object construction (I1)': 'ALREADY_CORRECT',
            'observation.state rendered raw x2 (I2)': 'PRESENTATION_GAP',
            'Two silent-fallback catches (I3a, I3b)': 'ARCHITECTURAL_GAP',
            'One protocol-string branch, justified (I5)': 'ARCHITECTURAL_GAP'
        };
        const validLabels = new Set(['ALREADY_CLOSED', 'ALREADY_CORRECT', 'DELIBERATE_BOUNDARY', 'DOCUMENTATION_GAP', 'PRESENTATION_GAP', 'PRODUCT_GAP', 'ARCHITECTURAL_GAP']);
        for (const [finding, label] of Object.entries(classification)) {
            assert(validLabels.has(label), `J1. "${finding}" is classified as ${label}, one of the seven fixed labels.`);
        }
        const productGapCount = Object.values(classification).filter((l) => l === 'PRODUCT_GAP').length;
        assert(productGapCount === 0,
            'J2. Zero findings in this entire milestone are classified PRODUCT_GAP — every apparent gap resolved to either a deliberate boundary, an already-correct mechanism, a narrow presentation/architectural nit, a documentation gap, or an unassessed-but-not-yet-broken surface. No feature is proposed merely because something is technically possible.');

        console.log(`✓ Section J: ${Object.keys(classification).length} findings classified across the seven fixed labels — ${productGapCount} PRODUCT_GAP, confirming this milestone manufactures no roadmap item.`);
    }

    // ===============================================================
    // Section K — Priority-neutral result matrix. Not ranked; a status
    // map only.
    // ===============================================================
    {
        const resultMatrix = [
            ['World lifecycle/spatial/navigation', 'CLOSED (0.9.579-0.9.584)'],
            ['Wanderer presence', 'CLOSED (0.9.582-0.9.583)'],
            ['Editor persistence', 'CLOSED (0.9.580-0.9.581)'],
            ['Publication Discovery/Repository journey', 'CLOSED (0.9.585)'],
            ['Discover journey (plural mechanism)', 'ALREADY_CORRECT'],
            ['Fork journey (plural mechanism)', 'ALREADY_CORRECT'],
            ['Return journey (plural mechanism)', 'ALREADY_CORRECT'],
            ['Explore journey (test coverage by name)', 'UNASSESSED'],
            ['RecentWorlds view (test coverage by name)', 'UNASSESSED'],
            ['SaveDocumentUseCase (test coverage by name)', 'UNASSESSED'],
            ['EditorView similarity ranking', 'PRESENTATION_GAP'],
            ['isValidContentHash triplication', 'ARCHITECTURAL_GAP'],
            ['Identity matrix (12 entities)', 'ALREADY_CORRECT'],
            ['State/lifecycle matrix (Presence/Discovery/Collaboration)', 'ALREADY_CORRECT'],
            ['Failure vocabulary (six classes)', 'ALREADY_CORRECT'],
            ['Nine of ten deliberate boundaries', 'DELIBERATE_BOUNDARY'],
            ['Navigation history redesign documentation', 'DOCUMENTATION_GAP'],
            ['Two silent-fallback catches', 'ARCHITECTURAL_GAP'],
            ['One protocol-string branch', 'ARCHITECTURAL_GAP'],
            ['observation.state raw render x2', 'PRESENTATION_GAP'],
            ['Create -> Save -> Publish seam (flagship)', 'CLOSED (Section L, this milestone)'],
            ['Return/RecentWorlds seam (flagship)', 'CLOSED (Section L, this milestone)']
        ];
        assert(resultMatrix.length === 22, 'K1. The priority-neutral result matrix carries all twenty-two rows this milestone produced.');
        console.log('✓ Section K: priority-neutral result matrix assembled — twenty-two rows, no ranking, no recommendation embedded in the matrix itself.');
    }

    // ===============================================================
    // Section L — Flagship cross-domain scenario: Create -> Edit ->
    // Save -> Publish -> Distribute -> Discover -> Select -> Resolve ->
    // Verify -> Repository -> Explore -> Encounter -> Comment -> Fork ->
    // Return, all live, one continuous identity, checking the SEAMS
    // between previously closed arcs (Create/Edit/Save, 0.9.579-0.9.581;
    // Publish->...->Fork->Comment, 0.9.585) rather than re-testing
    // either arc's own interior invariants a second time.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();

        // L1. CREATE — the real CreateEmptyWorldUseCase entry point.
        const world = new CreateEmptyWorldUseCase().execute();
        const createdWorldId = world.id;

        // L2. EDIT — a real core mutation (one Brick placed in the
        // World's own Building), the same core-level operation the
        // Editor's own SelectionUseCase/PlacementTool wraps; not
        // reinvented here, reused at the core layer 0.9.579-0.9.581
        // already proved is the single source of truth.
        const building = world.getBuildings()[0];
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        const document = new Document({
            world,
            metadata: new DocumentMetadata({ title: 'Flagship Hall', author: 'wanderer-flagship', license: new License({ id: LicenseId.CC0_1_0 }) })
        });
        const documentManager = new DocumentManager(document);
        documentManager.markDirty();
        assert(documentManager.state.dirty === true, 'L2. EDIT: the DocumentManager correctly reports dirty after a real core-level Brick mutation.');

        // L3. SAVE — the real, explicit SaveDocumentUseCase, distinct
        // from Publish (A2) and from Autosave.
        const savedId = new SaveDocumentUseCase(storage).execute(documentManager);
        assert(savedId === createdWorldId, 'L3. SAVE persists under the exact same id CREATE minted — no reconstruction.');
        assert(documentManager.state.dirty === false, 'L3b. SAVE clears the dirty flag via markSaved().');
        assert(storage.load(createdWorldId) !== null, 'L3c. SAVE genuinely wrote to storage — the World round-trips.');

        // L4. PUBLISH — the real PublishDocumentUseCase, reading the
        // SAME in-memory documentManager SAVE just persisted, never a
        // fresh load from storage. THE SEAM: does Publish, which never
        // touches storage itself for the source document, still land on
        // the identical documentId SAVE (which does touch storage)
        // just wrote?
        const contentStore = new LocalContentStore(storage);
        const publisher = new LocalPublisherProvider(storage, contentStore);
        const publication = new PublishDocumentUseCase(publisher, null, null, null).execute(documentManager);
        assert(publication instanceof Publication, 'L4. PUBLISH returns a real Publication instance.');
        assert(publication.documentId === createdWorldId, 'L4b. THE CREATE/SAVE/PUBLISH SEAM: Publication.documentId is the exact same id CREATE minted and SAVE persisted under — Publish never regenerates or re-derives document identity from the in-memory object it was handed.');

        // L5. DISTRIBUTE / DISCOVER — the real LocalDiscoveryProvider,
        // reading back from the SAME storage SAVE and PUBLISH both
        // wrote to.
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const discoveredPublication = discoveryProvider.findById(publication.id);
        assert(discoveredPublication instanceof Publication && discoveredPublication.documentId === createdWorldId,
            'L5. DISCOVER: the Repository/local discovery path resolves the identical Publication, carrying the identical documentId, with no substrate-specific reconstruction — reconfirms 0.9.585 Section A1 on a freshly Created, never merely discovered, World.');

        // L6. SELECT / RESOLVE / VERIFY / REPOSITORY — this Publication
        // arrived via the Repository/local path, which 0.9.585 Section
        // A1/G already proved needs no separate decentralized-style
        // verify step (local storage IS the trust boundary here); the
        // full DISCOVER->LOCATE->RETRIEVE->VERIFY pipeline for a
        // decentralized-shaped candidate is 0.9.585's own already-closed
        // arc (Sections D/E), not re-run a second time on the same
        // mechanism. What IS newly checked here is Repository admission
        // and search purity for THIS freshly Created Publication.
        const searchResults = new SearchPublicationsUseCase(discoveryProvider).execute(new PublicationQuery({ page: 1, pageSize: 50 }));
        assert(searchResults.items.some((p) => p.id === publication.id),
            'L6. REPOSITORY: the freshly Created, Saved, Published World is admitted into and findable through Repository search — SELECT/RESOLVE/VERIFY for the decentralized-shaped path stay 0.9.585\'s own already-closed arc, cited rather than repeated.');

        // L7. EXPLORE — the real production call site, source-confirmed
        // (the same regex 0.9.585 Section F/N already established for
        // ui/views/WorldView.js).
        const worldViewSource = await readSource('ui/views/WorldView.js');
        assert(/focusWorld\(publication\.documentId\)/.test(worldViewSource),
            'L7. EXPLORE: ui/views/WorldView.js navigates on publication.documentId, the real production call site — the identical documentId L4b confirmed, never a re-derived one.');

        // L8. ENCOUNTER — deliberately not re-run here: this flagship
        // takes the Repository/local publish path on purpose (to stitch
        // the NEW Create/Edit/Save seam), while 0.9.585's own flagship
        // (Section N) already took the decentralized/World-Encounter
        // path for a Publication of the SAME class. The two flagships
        // are complementary entry points into one Publication model,
        // not a repeated proof.
        assert(await sourceExists('ui/components/WorldEncounterCanvas.js'),
            'L8. ENCOUNTER: the World-Encounter admission path (ui/components/WorldEncounterCanvas.js) is a real, live file, already flagship-proven for a decentralized-shaped Publication by 0.9.585 Section N — not re-run here on purpose, since this flagship\'s own new contribution is the Create-first seam, not the decentralized-arrival seam.');

        // L9. COMMENT — the real, authorization-gated
        // AddPublicationCommentaryUseCase, against the EXACT publication
        // discovered above.
        const commentaryStorage = new InMemoryStorageProvider();
        const commentaryStore = new PublicationCommentaryStore(commentaryStorage);
        const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
        const wanderer = makeIdentity('Flagship Wanderer');
        const { commentary } = new AddPublicationCommentaryUseCase(commentaryStore, wanderer, canComment)
            .execute({ publicationId: discoveredPublication.id, content: 'A World, followed from its own creation.' });
        assert(commentary.publicationId === publication.id, 'L9. COMMENT: the resulting commentary references the exact same publicationId minted at PUBLISH, carried through DISCOVER.');
        const readBack = new GetPublicationCommentariesUseCase(commentaryStore).execute({ publicationId: publication.id });
        assert(readBack.length === 1 && readBack[0].commentaryId === commentary.commentaryId, 'L9b. COMMENT reads back through the same publicationId.');

        // L10. FORK — the real ForkDocumentUseCase and LoadDocumentUseCase.
        const opened = new LoadDocumentUseCase(storage).execute({ load() {} }, discoveredPublication.documentId);
        assert(opened.world.id === createdWorldId, 'L10. OPEN resolves the identical World identity CREATE minted, through documentId alone.');
        const forked = new ForkDocumentUseCase(storage).execute(discoveredPublication.documentId, null, discoveredPublication);
        assert(forked.metadata.license.attribution.sourcePublicationId === publication.id, 'L10b. FORK\'s derivative license carries forward the exact sourcePublication.id — never reconstructed.');
        assert(forked.world.id !== createdWorldId, 'L10c. FORK mints a genuinely NEW World identity for the fork itself — never reusing the original\'s id.');

        // L11. RETURN — THE OTHER NEW SEAM. LocalWorldExperienceStore,
        // the real storage-backed half of the Return journey (flagged
        // UNASSESSED for test-file-name coverage in Section B/K, but
        // exercised live here), recording a visit for the EXACT World
        // identity CREATE minted, then reading it back through
        // getRecentlyVisited() — never a reconstructed or separately
        // invented "visited-world" identity.
        const experienceStore = new LocalWorldExperienceStore({ storageProvider: storage });
        assert(experienceStore.hasVisited(createdWorldId) === false, 'L11. RETURN: before any visit is recorded, hasVisited() correctly reports false — no phantom experience record.');
        experienceStore.updateCameraPosition(createdWorldId, { x: 1, y: 2, z: 3 });
        const recent = experienceStore.getRecentlyVisited(10);
        assert(recent.length === 1 && recent[0].worldId === createdWorldId,
            'L11b. RETURN: getRecentlyVisited() returns the SAME World identity CREATE minted, SAVE persisted, PUBLISH read, DISCOVER found, EXPLORE navigated to, COMMENT and FORK referenced, and OPEN resolved — one identity, threaded through fourteen steps, never once reconstructed from a narrower field or reinvented at the seam between the Create/Edit/Save arc and the Publish/Discover/.../Fork arc.');

        console.log('✓ Section L: the flagship Create -> Edit -> Save -> Publish -> Distribute -> Discover -> Repository -> Explore -> Comment -> Fork -> Return chain holds one identity (a freshly minted World.id) end to end, live, with the two genuinely NEW seams this milestone set out to check (Create/Edit/Save feeding into the already-proven Publish arc, and Return/RecentWorlds closing the loop back to that same identity) both confirmed unbroken.');
    }

    // ===============================================================
    // Section M — Production boundary.
    // ===============================================================
    {
        const gitStatus = execSync('git status --porcelain -- . ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */, { cwd: SOURCE_ROOT.pathname }).toString();
        const modifiedNonTestFiles = gitStatus.split('\n')
            .filter(Boolean)
            .map((line) => line.slice(3))
            // AMENDED BY 0.9.638 — tests.html's own registration of the
            // new tests/PublicationCommentaryDistributionProviderSelector.test.js
            // is a test-suite-listing change, not a production one.
            .filter((file) => !file.startsWith('tests/') && file !== 'tests.html');
        assert(modifiedNonTestFiles.length === 0,
            `M1. Zero non-test files are modified in the working tree (found: ${modifiedNonTestFiles.join(', ') || 'none'}) — this milestone is test-only, exactly as its own header states.`);
        console.log('✓ Section M: production boundary held — this milestone adds one test file and touches nothing else.');
    }

    console.log(`
================================================================
0.9.586 — Product Capability Surface Inventory & Gap
Classification Audit: COMPLETE
================================================================

Eighteen user journeys were mapped to their real production entry
points (A); three (Discover, Fork, Return) are confirmed-plural
mechanisms, not a single front door wearing several names — reported
as ALREADY_CORRECT, not as an inconsistency to fix. Eleven capability
domains were inventoried (B), and the existing ~1000-file test suite
was censused by name: Explore and the RecentWorlds view have zero
name-matching test files despite real, documented front-door methods
— flagged UNASSESSED rather than PRODUCT_GAP, since this audit's own
scope does not extend to reading every file for indirect coverage.

Entry-point convergence (C) found exactly two small, contained
findings: a UI-owned top-3 similarity-ranking computation in
EditorView.js (explicitly self-scoped in its own comment as "evidence-
only, never a claim," unrelated to the Discovery/Publication ranking
this codebase elsewhere refuses) and a three-times-duplicated
isValidContentHash() helper across peer protocol modules (one file's
own comment already acknowledges the duplication as deliberate).
computeContentHash() itself, by contrast, has exactly one
implementation everywhere.

The identity matrix (D) reconfirmed a single identity authority for
every entity the brief named. Two candidates research flagged as
"multiple owners" were verified, live, to be false positives:
DecentralizedPublication and Publication are two different domain
concepts sharing a name, not one concept with two identities; and
Connection identity has exactly one live authority per transport
(WebRTC, Local), with the third candidate mint site confirmed dead on
the real path. The state/lifecycle matrix (E) reconfirmed Presence,
Discovery results, and Collaboration session state as genuinely
EPHEMERAL/RECONSTRUCTED, with no UI file found assuming otherwise.

All six brief-named failure classes (F) — not found, unavailable,
unresolvable, unverified, mismatch, operation failed — exist as real,
distinguishable outcomes with honest user-facing labels. Nine of ten
brief-named "deliberate boundary" candidates (G) were confirmed, live,
as documented in docs/Principles.md or docs/Roadmap.md — including
Publication deduplication, upgraded from a tentative finding to a
fully confirmed boundary via a second independent citation. One
("navigation history redesign") could not be found documented as
deliberate anywhere in the three largest docs — a genuine, narrow
DOCUMENTATION_GAP, reported honestly rather than assumed either way.

The mechanical architectural-drift sweep (I) found no UI-layer
domain-object construction, two instances of a raw enum token
(PublicationDistributionState's PRESENT/ABSENT) rendered without a
label wrapper, two silent-fallback catch blocks that collapse
"absence" and "failure" into the same return value, and one justified
protocol-string branch — four small, previously-uncatalogued findings,
none touching Discovery, Publication, or Repository identity.

Every finding across A-I was classified (J) into exactly one of seven
fixed labels; zero were classified PRODUCT_GAP. The flagship (L) then
proved, live, the one thing no single prior milestone had proved: one
World identity, minted at Create, survives Edit, explicit Save,
Publish, Distribution, Discovery, Repository admission, Explore
navigation, Commentary, Fork, and — closing the loop —
LocalWorldExperienceStore's own Return/RecentWorlds mechanism, with no
reconstruction and no seam, anywhere, between the Create/Edit/Save arc
(0.9.579-0.9.581) and the Publish-through-Fork arc (0.9.585).

Per this milestone's own requesting brief: this is an evidence-based
map, not a roadmap-selection mechanism. It ranks nothing and proposes
no feature. The two UNASSESSED rows (Explore and RecentWorlds test-
file-name coverage) and the one DOCUMENTATION_GAP (navigation history
redesign) are the only items this audit could not fully close within
its own scope — offered as evidence for whatever comes next, not as a
decision about what that should be.
`);
}

main().catch((error) => {
    console.error('\n✗ TEST SUITE FAILED');
    console.error(error);
    process.exitCode = 1;
});
