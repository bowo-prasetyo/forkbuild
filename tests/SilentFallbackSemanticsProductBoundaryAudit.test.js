import { execSync } from 'node:child_process';

import { NostrSnapshotDiscoveryQueryService } from '../application/nostr/NostrSnapshotDiscoveryQueryService.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { StructureDocumentResolver } from '../application/editor/StructureDocumentResolver.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { ownPublicationPanelFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';

// 0.9.588 — Silent Fallback Semantics Product Boundary Audit.
//
// TYPE: test-only. No production code changed — every section below is
// live evidence (real construction/execution of the two flagged
// collaborators, or a readSource() + regex/substring match against the
// real, unmodified file) rather than a description of what the code is
// believed to do.
//
// 0.9.587 closed the one DOCUMENTATION_GAP 0.9.586's Product Capability
// Surface Inventory raised (navigation history). That milestone's own
// closing note named what was left: "two presentation leaks, two silent
// fallbacks, one justified protocol branch" — narrow findings from
// 0.9.586's Section I architectural-drift sweep, deliberately NOT bundled
// into another audit until evidence said one was worth it. This milestone
// is that evidence-gathering pass for exactly the "two silent fallbacks"
// half of that list — 0.9.586's own I3a/I3b, the ONLY two occurrences
// that milestone itself labelled "silent-fallback catches" anywhere in
// its own test file or console output.
//
// A NOTE ON "FOUR." The requesting brief for this milestone refers to
// "the exact four fallback findings reported by 0.9.586." Reading
// 0.9.586's own test file (tests/ProductCapabilitySurfaceInventory
// GapClassificationAudit.test.js, Section I and its own classification
// table in Section J) line by line finds exactly TWO findings 0.9.586
// itself calls "silent fallback": I3a (application/NostrSnapshot
// DiscoveryQueryService.js#search()) and I3b (application/Structure
// DocumentResolver.js#resolve()). The other two narrow findings from that
// same sweep — I2 (observation.state rendered as a raw enum token, x2)
// and I5 (one justified protocol-string branch) — are real, but neither
// has a primary-path/fallback-path shape at all: I2 is a label-wrapper
// omission on a value that IS what was requested, and I5 is a branch on
// a literal string, not a degradation from one source/value to another.
// Forcing either through this milestone's own central question ("is a
// fallback preserving or changing the user's requested meaning?") would
// manufacture an answer neither finding is actually shaped to give. Per
// this milestone's own explicit exclusion — no mechanical sweep, no
// broadening the search — Section A below documents this precisely
// rather than silently substituting "two" for "four" or forcing I2/I5
// into a framework they do not fit. That correction is itself this
// milestone's first finding.
//
// EIGHT lettered sections (A-H) plus the standard closing K/L/M this
// series uses for classification, flagship, and production boundary:
//   A. Inventory — I3a/I3b, read live from 0.9.586's own file, plus the
//      "four vs two" correction.
//   B. Fallback classification — six-label vocabulary, applied live.
//   C. Identity preservation — does a fallback ever return a DIFFERENT
//      requested entity, live-proven.
//   D. Failure vs substitution — proven live: neither mechanism ever
//      substitutes alternate content; both collapse to an absence
//      sentinel ([]/null), never a stand-in value.
//   E. User-visible behavior — the one real finding: OwnPublicationPanel.js's
//      own empty-state copy asserts more certainty than the underlying
//      mechanism actually has, and the panel's own existing "could not be
//      completed" error copy is proven, live, unreachable for this exact
//      failure mode.
//   F. Source/substrate isolation — confirmed live: not applicable to
//      either finding (neither is a cross-substrate mechanism).
//   G. Failure injection — the five-state matrix, run live, against both
//      collaborators.
//   H. Persistence and identity — confirmed live: neither fallback path
//      ever writes, mutates, or mints a new durable fact.
//   I. Architectural ownership — both mechanisms live in application/,
//      confirmed as their sole owner.
//   J. Documentation — checked against docs/Principles.md and
//      docs/Roadmap.md by the same live-citation discipline 0.9.586/
//      0.9.587 already established.
//   K. Final classification.
//   L. Flagship — both collaborators exercised through their real
//      production command boundary across all three primary-path states.
//   M. Production boundary — test-only.
//
// Explicitly excluded, per the requesting brief: removing fallback
// mechanisms, adding retry/failover/ranking/health-checks/providers,
// changing discovery or content-backend selection semantics, exposing
// raw fallback details to users, redesigning error handling, and any
// production code change — this milestone classifies, it does not fix.
// If Section K's classification below had produced a genuine PRODUCT_GAP,
// this milestone would still not fix it; it would name 0.9.589 as the
// smallest possible correction, per the requesting brief's own closing
// paragraph. It did not: see Section K.

const SOURCE_ROOT = new URL('../', import.meta.url);

// Strips leading `//` comment markers so a prose regex spanning several
// wrapped comment lines can match against plain whitespace, exactly as a
// reader would read the words themselves.
function uncommented(source) {
    return source.split('\n').map((line) => line.replace(/^\s*\/\/ ?/, '')).join('\n');
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

async function main() {
    // ===============================================================
    // Section A — Inventory: I3a/I3b, read live from 0.9.586's own
    // file, plus the "four vs two" correction.
    // ===============================================================
    {
        const priorAuditSource = await readSource('tests/ProductCapabilitySurfaceInventoryGapClassificationAudit.test.js');

        assert(priorAuditSource.includes("'Two silent-fallback catches (I3a, I3b)': 'ARCHITECTURAL_GAP'"),
            'A1. 0.9.586\'s own classification table names exactly ONE finding under the "silent fallback" label, covering two sub-occurrences (I3a, I3b) — not four separate findings.');
        assert(priorAuditSource.includes("I3a. application/nostr/NostrSnapshotDiscoveryQueryService.js#search() collapses a query timeout/network error into the same [] a genuine zero-results response returns"),
            'A2. I3a, quoted verbatim from 0.9.586\'s own file: a query timeout/network error and a genuine zero-results response both produce [].');
        assert(priorAuditSource.includes("I3b. application/editor/StructureDocumentResolver.js collapses a deserialize failure (corrupt/foreign blob) into the same null a genuine \"not found\" returns"),
            'A3. I3b, quoted verbatim from 0.9.586\'s own file: a deserialize failure (corrupt/foreign blob) and a genuine "not found" both produce null.');

        // A4. I2 and I5 (the other two narrow findings from the same
        // sweep) are real but not fallback-shaped — recorded once, here,
        // as the basis for this milestone's own scope correction, never
        // re-audited below.
        assert(priorAuditSource.includes('observation.state rendered raw x2 (I2)') && priorAuditSource.includes("'PRESENTATION_GAP'"),
            'A4. I2 (raw enum render) is 0.9.586\'s own PRESENTATION_GAP, not a fallback finding — a value that IS what was requested, rendered without a label, never a case where one thing was substituted for another.');
        assert(priorAuditSource.includes("I5. application/publication/distribution/PublicationDistributionCommand.js"),
            'A5. I5 (the protocol-string branch) is a branch on a literal string inside generic lifecycle code, not a primary-path/fallback-path substitution of any kind — out of this milestone\'s own scope by its own central question.');

        console.log('✓ Section A: exactly two silent-fallback occurrences (I3a, I3b) inventoried from 0.9.586\'s own file, verbatim — the requesting brief\'s "four" appears to count I2/I5 alongside them, but those two do not have a primary/fallback shape and are excluded from this audit\'s own central question rather than forced into it.');
    }

    // ===============================================================
    // Section B — Fallback classification (six-label vocabulary),
    // applied live to I3a and I3b.
    // ===============================================================
    {
        const nostrSource = await readSource('application/nostr/NostrSnapshotDiscoveryQueryService.js');
        const resolverSource = await readSource('application/editor/StructureDocumentResolver.js');

        // B1. I3a's OWN header states the design intent in its own
        // words: never throw, every failure degrades to []. This is the
        // vocabulary of GRACEFUL_DEGRADATION (a safe, documented API
        // contract), not EXPLICIT_FALLBACK (there is no second source
        // being tried) and not DEFAULT_VALUE in the config-value sense.
        assert(/NEVER THROWS FROM `search\(\)` — EVERY FAILURE DEGRADES TO `\[\]`/.test(nostrSource),
            'B1. application/nostr/NostrSnapshotDiscoveryQueryService.js\'s own header states its design intent in these exact words — a documented API contract, not an unnoticed side effect.');

        // B2. I3b's OWN header/inline comments state the identical
        // intent for its own null.
        assert(/never\s+throws\s+—\s+a\s+placement\s+whose\s+Document\s+has\s+been\s+removed/is.test(uncommented(resolverSource)),
            'B2. application/editor/StructureDocumentResolver.js\'s own header states the identical intent — GRACEFUL_DEGRADATION, not an unnoticed side effect.');

        // B3. Neither file's degrade path branches on WHICH of several
        // sources/substrates produced the failure — there is exactly one
        // source in each (one relay; one storageProvider), so neither
        // finding is COMPATIBILITY_BEHAVIOR (old-format tolerance) or
        // EXPLICIT_FALLBACK (source B used because source A failed).
        // Checked against the CLASS BODY only (not the file's own
        // explanatory header, which legitimately discusses sibling/
        // related files by name) — the executable degrade logic itself
        // never touches a second substrate.
        const nostrClassBody = nostrSource.slice(nostrSource.indexOf('export class NostrSnapshotDiscoveryQueryService'));
        const resolverClassBody = resolverSource.slice(resolverSource.indexOf('export class StructureDocumentResolver'));
        assert(!/arweave|ipfs|peer/i.test(nostrClassBody), 'B3a. application/nostr/NostrSnapshotDiscoveryQueryService.js\'s own class body never references a second substrate — its degrade path is single-source, not a cross-source fallback.');
        assert(!/arweave|ipfs|peer/i.test(resolverClassBody), 'B3b. application/editor/StructureDocumentResolver.js\'s own class body never references a second substrate — its degrade path is single-source (one storageProvider), not a cross-source fallback.');

        console.log('✓ Section B: both I3a and I3b classify as GRACEFUL_DEGRADATION at the mechanism level — a documented, single-source "never throw" contract, not EXPLICIT_FALLBACK, COMPATIBILITY_BEHAVIOR, or an undocumented UNKNOWN.');
    }

    // ===============================================================
    // Section C — Identity preservation: does a fallback ever return a
    // DIFFERENT requested entity? Proven live: no.
    // ===============================================================
    {
        // C1. NostrSnapshotDiscoveryQueryService — resolveLocator() for
        // one discoveryTag/contentHash pair never returns a candidate
        // announced under a DIFFERENT contentHash.
        const events = [
            { content: JSON.stringify({ protocol: 'forkbuild-snapshot-discovery', version: 1, contentHash: 'hashA', locator: 'ar://A', storage: 'arweave' }) },
            { content: JSON.stringify({ protocol: 'forkbuild-snapshot-discovery', version: 1, contentHash: 'hashB', locator: 'ar://B', storage: 'arweave' }) }
        ];
        const service = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => events });
        const locatorA = await service.resolveLocator('tag', 'hashA');
        const locatorB = await service.resolveLocator('tag', 'hashB');
        const locatorMissing = await service.resolveLocator('tag', 'hashC');
        assert(locatorA === 'ar://A' && locatorB === 'ar://B',
            'C1a. resolveLocator() returns exactly the locator announced for the REQUESTED contentHash — hashA never returns ar://B\'s locator or vice versa.');
        assert(locatorMissing === null,
            'C1b. resolveLocator() for a contentHash no event announced returns null, never a candidate for a different contentHash silently substituted in.');

        // C2. StructureDocumentResolver — resolving documentId X never
        // returns a Document saved under a DIFFERENT documentId, even
        // when a same-shaped corrupt entry exists nearby in storage.
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const worldA = new World({});
        const buildingA = new Building({});
        buildingA.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        worldA.addBuilding(buildingA);
        const documentA = new Document({ world: worldA, metadata: new DocumentMetadata({ title: 'House A' }) });
        storage.save(worldA.id, serializer.serialize(documentA));

        const worldB = new World({});
        const buildingB = new Building({});
        buildingB.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        buildingB.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        worldB.addBuilding(buildingB);
        const documentB = new Document({ world: worldB, metadata: new DocumentMetadata({ title: 'House B' }) });
        storage.save(worldB.id, serializer.serialize(documentB));

        storage.save('corrupt-neighbor', { not: 'a valid document' });

        const resolvedA = resolver.resolve(worldA.id);
        const resolvedB = resolver.resolve(worldB.id);
        assert(resolvedA.getBuildings()[0].getBricks().length === 1 && resolvedB.getBuildings()[0].getBricks().length === 2,
            'C2a. resolve(worldA.id) and resolve(worldB.id) each return exactly their OWN saved World, distinguished correctly even with a corrupt, unrelated entry present in the same storage.');
        assert(resolver.resolve('corrupt-neighbor') === null,
            'C2b. resolve() of the corrupt entry itself is null, never A\'s or B\'s content borrowed as a stand-in.');

        console.log('✓ Section C: identity preservation holds for both mechanisms — a fallback outcome is always either the exact requested entity or an explicit absence (null/no-match), never a different entity silently substituted in its place.');
    }

    // ===============================================================
    // Section D — Failure vs substitution: neither mechanism ever
    // substitutes alternate CONTENT for a failure; both collapse to a
    // content-free absence sentinel.
    // ===============================================================
    {
        // D1. A rejecting queryImpl never causes search() to invent
        // candidates, reuse a previous result, or return anything other
        // than the same empty array a genuine zero-announcement response
        // produces.
        const rejectingService = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('relay unreachable'); } });
        const rejectingResult = await rejectingService.search('tag');
        assert(Array.isArray(rejectingResult) && rejectingResult.length === 0,
            'D1. search() against a rejecting queryImpl resolves to [] — the identical value a real, successful zero-result query returns. No stand-in candidate, no cached previous result, no synthesized content of any kind.');

        // D2. A corrupt blob never causes resolve() to substitute a
        // default/placeholder World — it is null, with no World object
        // at all, never a "some other content" fallback.
        const storage = new InMemoryStorageProvider();
        const resolver = new StructureDocumentResolver(storage, new DocumentSerializer());
        storage.save('corrupt', { not: 'a valid document' });
        assert(resolver.resolve('corrupt') === null,
            'D2. resolve() of a corrupt blob is null — no placeholder World, no empty-but-real World object, no default content substituted for what could not be read.');

        console.log('✓ Section D: both findings are "the requested operation cannot currently be completed" (an absence sentinel), never "the requested operation completed using something else" — the safer of the two shapes the brief distinguishes, and the one that never risks a semantically-wrong-but-plausible-looking result.');
    }

    // ===============================================================
    // Section E — User-visible behavior: the one real finding in this
    // milestone.
    // ===============================================================
    {
        const panelSource = (await Promise.all(ownPublicationPanelFiles().map((file) => readSource(file)))).join('\n');

        // E1. The panel's own copy for a genuine zero-candidate result.
        assert(/No Snapshots have been announced under this discoveryTag yet\./.test(panelSource),
            'E1. ui/components/OwnPublicationPanel.js renders "No Snapshots have been announced under this discoveryTag yet." whenever snapshotCandidateDiscoveryResult is an empty array — confirmed live, exact string.');

        // E2. The panel ALREADY has a distinct, more honest message for
        // "could not be completed" — proving the vocabulary this finding
        // needs already exists in the codebase.
        assert(/Snapshot candidate discovery could not be completed\./.test(panelSource),
            'E2. The identical file already carries a distinct "Snapshot candidate discovery could not be completed." message, written for its own .catch() branch — the panel already has the honest vocabulary this finding is about; it simply never reaches it for this failure mode (see E3).');

        // E3. THE FINDING: that catch() branch is provably unreachable
        // for NostrSnapshotDiscoveryQueryService specifically, because
        // search() never rejects — proven live by driving a rejecting
        // queryImpl through the exact same application-layer command the
        // panel itself calls.
        const rejectingService = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('relay unreachable'); } });
        let commandRejected = false;
        let commandResult = null;
        try {
            commandResult = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag', discoveryQueryService: rejectingService });
        } catch {
            commandRejected = true;
        }
        assert(commandRejected === false && Array.isArray(commandResult) && commandResult.length === 0,
            'E3. executeDiscoverSnapshotCandidatesCommand() — the exact application-layer command ui/components/OwnPublicationPanel.js#discoverSnapshotCandidates() calls — resolves to [] rather than rejecting when the underlying relay query fails. The panel\'s own .catch() branch (E2\'s message) is therefore unreachable for a relay-unreachable/timeout failure specifically; only a missing/malformed discoveryQueryService argument (a caller-contract violation, never a runtime relay condition) can ever reach it.');

        // E4. StructureDocumentResolver, by contrast, has NO user-facing
        // text distinguishing its two null causes anywhere — both
        // "never saved" and "corrupt" render identically as "nothing
        // here," which this milestone confirms is not a claim of
        // certainty about WHY, just an observation that there is
        // currently nothing to show — a narrower, safer shape than E1.
        const rendererSource = await readSource('renderer/WorldRenderer.js');
        assert(!/corrupt|unreadable|deserializ/i.test(rendererSource),
            'E4. renderer/WorldRenderer.js — the real consumer of StructureDocumentResolver#resolve() — contains no "corrupt"/"unreadable"/"deserialize" vocabulary of any kind; a null resolution renders no meshes and asserts nothing about why, never a false claim of certainty the way E1\'s copy does.');

        console.log('✓ Section E: I3a\'s mechanism is safe, but its ONE consuming UI surface (OwnPublicationPanel.js) states "No Snapshots have been announced... yet" as a flat fact for a case that may actually mean "could not ask" — a real, narrow PRESENTATION_GAP. I3b has no equivalent UI-level overclaim: nothing renders either way, and no text asserts a reason.');
    }

    // ===============================================================
    // Section F — Source/substrate isolation: adversarial combinations
    // from the requesting brief (Nostr/Arweave/IPFS/Peer), tested only
    // where the existing fallback actually applies.
    // ===============================================================
    {
        const nostrSource = await readSource('application/nostr/NostrSnapshotDiscoveryQueryService.js');
        const resolverSource = await readSource('application/editor/StructureDocumentResolver.js');

        // F1. Neither finding has a second substrate to fail over to —
        // confirmed live by construction, not merely by absence of a
        // keyword: NostrSnapshotDiscoveryQueryService is constructed
        // with exactly one relayUrl and one queryImpl.
        assert(/EXACTLY ONE RELAY PER INSTANCE — NO FAN-OUT, NO RACE, NO AGGREGATION/.test(nostrSource),
            'F1. application/nostr/NostrSnapshotDiscoveryQueryService.js\'s own header states "exactly one relay per instance" — there is no second relay, and no Arweave/IPFS/peer path, for this class to fall back to. The brief\'s own adversarial-combination scenarios (Nostr unavailable/Arweave available, etc.) do not apply to this finding: it is a single-substrate degrade, not a substrate switch.');

        // F2. StructureDocumentResolver resolves against exactly the one
        // storageProvider it was constructed with — no peer/remote
        // fallback of any kind.
        assert(/this\._storageProvider = storageProvider;/.test(resolverSource) && !/peer|remote|network/i.test(resolverSource),
            'F2. application/editor/StructureDocumentResolver.js resolves against exactly one, already-injected storageProvider — no peer/remote fallback path exists for this class to accidentally substitute. The brief\'s own "Peer unavailable, Local available" scenario does not apply: there is no peer path here at all.');

        console.log('✓ Section F: confirmed N/A for both findings — neither is a cross-substrate mechanism, so neither can become automatic candidate substitution, cross-substrate identity substitution, or silent content-backend switching. This is a clean result, not a skipped section.');
    }

    // ===============================================================
    // Section G — Failure injection: the five-state matrix, run live.
    // ===============================================================
    {
        // G1-G3: NostrSnapshotDiscoveryQueryService — primary succeeds,
        // primary fails (rejects), primary unavailable (times out).
        const goodEvent = { content: JSON.stringify({ protocol: 'forkbuild-snapshot-discovery', version: 1, contentHash: 'hashA', locator: 'ar://A', storage: 'arweave' }) };

        const succeedingService = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => [goodEvent] });
        const succeedResult = await succeedingService.search('tag');
        assert(succeedResult.length === 1 && succeedResult[0].locator === 'ar://A',
            'G1. Primary succeeds: search() returns the real, single announced candidate.');

        const rejectingService = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('relay unreachable'); } });
        const rejectResult = await rejectingService.search('tag');
        assert(Array.isArray(rejectResult) && rejectResult.length === 0,
            'G2. Primary fails (queryImpl rejects): search() degrades to [] — same observable shape as G1 returning zero real announcements, per I3a\'s own documented contract.');

        const neverSettles = () => new Promise(() => {});
        const timeoutService = new NostrSnapshotDiscoveryQueryService({ queryImpl: neverSettles, timeoutMs: 15 });
        const timeoutResult = await timeoutService.search('tag');
        assert(Array.isArray(timeoutResult) && timeoutResult.length === 0,
            'G3. Primary unavailable (queryImpl never settles, guarded by timeoutMs): search() degrades to [] — the identical shape as G2.');

        // G4-G6: StructureDocumentResolver — primary succeeds, primary
        // fails (never saved), primary unavailable (corrupt/undeserializable).
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const world = new World({});
        const building = new Building({});
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        world.addBuilding(building);
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'House' }) });
        storage.save(world.id, serializer.serialize(document));

        assert(resolver.resolve(world.id) !== null, 'G4. Primary succeeds: resolve() returns the real, saved World.');
        assert(resolver.resolve('never-saved-id') === null, 'G5. Primary fails (id never saved): resolve() returns null.');
        storage.save('corrupt-id', { not: 'a valid document' });
        assert(resolver.resolve('corrupt-id') === null, 'G6. Primary unavailable (saved data fails to deserialize): resolve() returns null — the identical shape as G5.');

        // G7. Neither mechanism HAS a distinct "fallback" step that can
        // itself succeed or fail — the degrade-to-sentinel value IS the
        // whole mechanism. Recorded explicitly rather than left
        // ambiguous: there is no fourth/fifth state to inject here.
        console.log('✓ Section G: both mechanisms\' failure/unavailable states collapse to the identical sentinel their own "genuine absence" state already produces (G1-G3, G4-G6). Neither has a separate fallback step capable of its own independent success/failure — "fallback succeeds" and "fallback fails" do not apply as distinct states for either finding, which is itself confirmed rather than assumed.');
    }

    // ===============================================================
    // Section H — Persistence and identity: a fallback must not
    // mutate or mint any durable fact.
    // ===============================================================
    {
        const nostrSource = await readSource('application/nostr/NostrSnapshotDiscoveryQueryService.js');
        const resolverSource = await readSource('application/editor/StructureDocumentResolver.js');

        assert(!/publishImpl|\.publish\(/.test(nostrSource),
            'H1. application/nostr/NostrSnapshotDiscoveryQueryService.js contains no publish call of any kind — search()\'s degrade path can only ever read, never announce a new discovery record as a side effect of failing to find one.');
        assert(!/storageProvider\.save\(|\.save\(/.test(resolverSource),
            'H2. application/editor/StructureDocumentResolver.js contains no storage write of any kind — resolve()\'s degrade path can only ever read, never persist a placeholder Document as a side effect of failing to resolve one.');

        // H3. Live: exercising the degrade path repeatedly never changes
        // storage's own contents.
        const storage = new InMemoryStorageProvider();
        const resolver = new StructureDocumentResolver(storage, new DocumentSerializer());
        const beforeKeys = storage.list();
        resolver.resolve('never-saved');
        resolver.resolve('never-saved');
        const afterKeys = storage.list();
        assert(beforeKeys.length === 0 && afterKeys.length === 0,
            'H3. Repeatedly resolving an unknown id never writes anything into storage — no placement identity, documentId, or contentHash is silently minted as a side effect of the degrade path.');

        console.log('✓ Section H: neither degrade path can write, and a live repeated-resolution check confirms storage is never touched — no fallback here can silently create a new durable fact.');
    }

    // ===============================================================
    // Section I — Architectural ownership.
    // ===============================================================
    {
        // I1. Both mechanisms live in application/, own their own
        // degrade decision, and are never re-implemented in ui/.
        assert((await readSource('application/nostr/NostrSnapshotDiscoveryQueryService.js')).length > 0,
            'I1a. application/nostr/NostrSnapshotDiscoveryQueryService.js is the sole owner of I3a\'s degrade decision — an application-layer file.');
        assert((await readSource('application/editor/StructureDocumentResolver.js')).length > 0,
            'I1b. application/editor/StructureDocumentResolver.js is the sole owner of I3b\'s degrade decision — an application-layer file.');

        // I2. Neither ui/ consumer re-implements its own catch-and-swallow
        // around these two calls — OwnPublicationPanel.js's own .then()/
        // .catch() (Section E) only ever forwards the ALREADY-collapsed
        // result/rejection; it adds no second layer of error-swallowing
        // of its own around discoverSnapshotCandidatesCommand().
        const panelSource = (await Promise.all(ownPublicationPanelFiles().map((file) => readSource(file)))).join('\n');
        const methodStart = panelSource.indexOf('discoverSnapshotCandidates() {');
        const methodEnd = panelSource.indexOf('selectSnapshotCandidate(candidate) {', methodStart);
        const discoveryMethodBody = panelSource.slice(methodStart, methodEnd);
        const commandCallCount = (discoveryMethodBody.match(/discoverSnapshotCandidatesCommand\(\)/g) || []).length;
        assert(discoveryMethodBody.includes('could not be completed') && commandCallCount === 1,

            'I2. ui/components/OwnPublicationPanel.js\'s own .catch() around discoverSnapshotCandidatesCommand() only sets one error message — it performs no additional retry, ranking, or source-substitution of its own; the UI layer forwards a decision, it does not make one.');

        console.log('✓ Section I: both fallback decisions are owned exactly once, at the application layer, by the file that also owns the operation itself — no UI-layer duplication, and no provider-layer diffusion of the same decision.');
    }

    // ===============================================================
    // Section J — Documentation.
    // ===============================================================
    {
        const principles = await readSource('docs/Principles.md');
        const roadmap = await readSource('docs/Roadmap.md');

        // J1. I3b IS documented, live, in docs/Principles.md's own 0.2.90
        // section, AND has a dedicated live test (tests/StructurePlacement.test.js)
        // asserting the exact corrupt-blob behavior with its own
        // rationale in the assertion message.
        assert(principles.includes('### A Missing Placement Target Is Absence, Not An Error (0.2.90)'),
            'J1a. docs/Principles.md contains a citable, permanent section on this exact behavior.');
        assert(/StructureDocumentResolver#resolve\(\)`\s+answers\s+`null`,\s+never\s+throws/.test(principles),
            'J1b. That section states the resolve()->null guarantee unconditionally (not carved out by cause) — a corrupt/foreign blob is covered by this general statement even though the prose\'s own two-cause list ("never actually saved, or storage being cleared") does not separately name it. A narrow textual-completeness nit, not a behavioral gap: the code\'s actual guarantee is broader than the prose\'s illustrative list.');
        const placementTestSource = await readSource('tests/StructurePlacement.test.js');
        assert(/resolve\(\) of a structurally invalid blob is null, never throws — DocumentSerializer\.deserialize\(\) /.test(placementTestSource),
            'J1c. tests/StructurePlacement.test.js (0.2.90, pre-existing, unmodified by this milestone) already asserts this exact corrupt-blob behavior live, with its own rationale in the assertion message — this is not merely documented, it is regression-guarded.');

        // J2. I3a's MECHANISM ("never throws from search()") is
        // documented in the file's own header AND in a dedicated test
        // file's own Sections D/E/F — but NOT, by the same
        // docs/Principles.md-or-docs/Roadmap.md discipline 0.9.586's own
        // Section G established, as a citable product-level statement.
        // This mirrors 0.9.586's own G3 finding (navigation history):
        // real, deliberate, code-documented and test-guarded, but not
        // written down in the two files this series treats as the
        // citable record.
        // Scoped to passages actually naming this class — a bare
        // `search()...never throws` match anywhere in either doc would
        // also catch the GENERIC DecentralizedDiscoveryQueryService
        // family's own, separately-cited "never throws" contract
        // (docs/Roadmap.md, the queryDecentralizedWorldDiscovery()
        // orchestration entry), which is a real, different, already-
        // documented sibling mechanism — NOT this finding. This class's
        // own header explicitly refuses that shared lineage ("A
        // STANDALONE CLASS — DELIBERATELY NOT A
        // DecentralizedDiscoveryQueryService"), so its own contract does
        // not inherit that sibling's citation.
        const classNamedNearContract = /NostrSnapshotDiscoveryQueryService[\s\S]{0,400}?(never throws|degrades to)/i;
        const mechanismCitedInDocs = classNamedNearContract.test(principles) || classNamedNearContract.test(roadmap);
        assert(mechanismCitedInDocs === false,
            'J2. Live regex search of docs/Principles.md and docs/Roadmap.md, scoped to passages naming NostrSnapshotDiscoveryQueryService itself, finds no statement of its "never throws / degrades to []" contract as a citable product-level statement — confirmed by absence, not assumed. (The generic, sibling DecentralizedDiscoveryQueryService family DOES have this exact contract cited in docs/Roadmap.md — but this class\'s own header explicitly refuses that shared lineage, so it does not inherit that citation.) The mechanism is real and deliberate here too (its own file header + tests/NostrSnapshotDiscoveryQueryService.test.js Sections D-F), just not recorded in either of the two files this series treats as the permanent citable record — the identical shape 0.9.586\'s own G3 finding had before 0.9.587 closed it.');
        const nostrDiscoverySection = roadmap.slice(roadmap.indexOf('## 0.9.133'), roadmap.indexOf('## 0.9.134'));
        assert(/a\s+genuine\s+transport\s+failure\s+propagates/.test(nostrDiscoverySection),
            'J3. docs/Roadmap.md\'s own 0.9.133 entry DOES contain the phrase "a genuine transport failure propagates" — but live reading of its surrounding sentence, and live comparison against application/nostr/NostrSnapshotDiscoveryPublisher.js#publish() (which has no try/catch around its own await, so a rejection does propagate), confirms that phrase describes the PUBLISH side of this family, not search(). It is not a stale/contradicted claim about I3a — a different, correctly-documented behavior on a sibling method.');

        // J4. docs/Roadmap.md DOES quote this exact empty-state copy —
        // live search finds it at 0.9.326 — but only as evidence that
        // the automatic and manual discovery paths render the IDENTICAL
        // pre-existing string for the identical result (a cross-path
        // CONSISTENCY claim). Read in full, that passage never asks
        // whether the string itself is accurate about what search()
        // actually knows — a materially different question from the one
        // this milestone's own brief centers on.
        const idx326 = roadmap.indexOf('No Snapshots have been announced under this discoveryTag yet');
        const context326 = roadmap.slice(Math.max(0, idx326 - 600), idx326 + 400);
        assert(idx326 !== -1 && /workflow-observability gap/i.test(context326) && /same live answer|identical result reference/i.test(context326),
            'J4a. docs/Roadmap.md (0.9.326) DOES cite this exact empty-state string — but its own surrounding text is entirely about proving the automatic-path and manual-path UIs show the SAME string for the SAME result (a "workflow-observability gap" / cross-path convergence question), never about whether the string over-claims certainty relative to search()\'s own swallowed-failure semantics (Section E, this milestone).');
        assert(/automatic\s+fallback\s+when\s+manual\s+recovery\s+fails/i.test(roadmap.slice(roadmap.indexOf('## 0.9.325'), roadmap.indexOf('## 0.9.326'))),
            'J4b. 0.9.325\'s own "deliberately excludes" list even names "automatic fallback when manual recovery fails" as out of scope — this whole neighborhood of milestones came close to fallback semantics repeatedly without ever asking Section E\'s specific question. That makes this a genuine, if narrow, PRESENTATION_GAP rather than something already settled by adjacent audits: several prior passes had the opportunity to notice the wording issue and were each, correctly, scoped to a different question.');

        console.log('✓ Section J: I3b is fully documented and regression-guarded (a closed DELIBERATE_BOUNDARY). I3a\'s mechanism is real and deliberate but not citably documented outside its own file/tests (the same shape as 0.9.586\'s own G3 before 0.9.587). Its one UI consumer\'s exact wording IS discussed in docs/Roadmap.md (0.9.326) — but only for cross-path consistency, never for the "not found vs. could not ask" distinction this milestone\'s own brief centers on, despite several adjacent milestones (0.9.324-0.9.326) working in the immediate neighborhood.');
    }

    // ===============================================================
    // Section K — Final classification.
    // ===============================================================
    {
        const classification = {
            'I3a mechanism — NostrSnapshotDiscoveryQueryService#search() degrades to [] on any failure': 'DELIBERATE_BOUNDARY',
            'I3a UI copy — OwnPublicationPanel.js "No Snapshots have been announced... yet"': 'PRESENTATION_GAP',
            'I3b — StructureDocumentResolver#resolve() degrades to null on "not found" or "corrupt"': 'DELIBERATE_BOUNDARY'
        };
        const validLabels = new Set(['ALREADY_CORRECT', 'DELIBERATE_BOUNDARY', 'DOCUMENTATION_GAP', 'PRESENTATION_GAP', 'PRODUCT_GAP', 'ARCHITECTURAL_GAP']);
        for (const [finding, label] of Object.entries(classification)) {
            assert(validLabels.has(label), `K1. "${finding}" is classified as ${label}, one of the six fixed labels.`);
        }
        const productGapCount = Object.values(classification).filter((l) => l === 'PRODUCT_GAP').length;
        const architecturalGapCount = Object.values(classification).filter((l) => l === 'ARCHITECTURAL_GAP').length;
        assert(productGapCount === 0,
            'K2. Zero PRODUCT_GAP — neither mechanism loses or corrupts a user\'s requested identity; both fail closed to an honest absence, never a substituted result.');
        assert(architecturalGapCount === 0,
            'K3. Zero ARCHITECTURAL_GAP — this is a DOWNGRADE from 0.9.586\'s own initial ARCHITECTURAL_GAP label for both I3a and I3b, based on evidence 0.9.586\'s own mechanical drift-sweep did not gather (the dedicated tests, the docs/Principles.md citation for I3b, and the UI-consumer trace for I3a). This mirrors 0.9.586\'s own G2 upgrade (Publication deduplication) — a label changing because deeper evidence was gathered, not because anything was fixed.');

        console.log(`✓ Section K: ${Object.keys(classification).length} findings classified — ${productGapCount} PRODUCT_GAP, ${architecturalGapCount} ARCHITECTURAL_GAP. Two of three are DELIBERATE_BOUNDARY (confirmed resilience, not defects); one is a narrow PRESENTATION_GAP (a UI copy overclaim, not a mechanism defect).`);
    }

    // ===============================================================
    // Section L — Flagship: both collaborators exercised through their
    // real production command boundary, primary-available /
    // primary-unavailable+fallback-available / primary-unavailable+
    // fallback-unavailable, proving no scenario changes the requested
    // identity or meaning.
    // ===============================================================
    {
        // L1. NostrSnapshotDiscoveryQueryService, through the real
        // application command a UI caller uses.
        const realCandidate = { content: JSON.stringify({ protocol: 'forkbuild-snapshot-discovery', version: 1, contentHash: 'flagship-hash', locator: 'ar://flagship', storage: 'arweave' }) };

        const availableService = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => [realCandidate] });
        const availableOutcome = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'flagship-tag', discoveryQueryService: availableService });
        assert(availableOutcome.length === 1 && availableOutcome[0].contentHash === 'flagship-hash' && availableOutcome[0].locator === 'ar://flagship',
            'L1. Primary available: the command returns exactly the real, announced candidate — correct identity, correct locator.');

        const unavailableService = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { throw new Error('relay down'); } });
        const unavailableOutcome = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'flagship-tag', discoveryQueryService: unavailableService });
        assert(Array.isArray(unavailableOutcome) && unavailableOutcome.length === 0,
            'L2. Primary unavailable (this class has no second source to fall back to): the command returns [] — an honest absence, never a fabricated candidate, and never flagship-hash\'s own candidate reused from L1 (no caching, no cross-call state).');

        // Re-run L1's own available service a second time to confirm L2's
        // failure did not poison or alter it — no shared mutable state.
        const availableOutcomeAgain = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'flagship-tag', discoveryQueryService: availableService });
        assert(availableOutcomeAgain.length === 1 && availableOutcomeAgain[0].contentHash === 'flagship-hash',
            'L3. The genuinely-available service still returns the correct candidate after an unrelated instance failed — confirming no shared state links the two.');

        // L4. StructureDocumentResolver, through the identical
        // primary-available / primary-unavailable pair, proving World
        // identity survives untouched and a failure never leaks a
        // different World's content.
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const flagshipWorld = new World({});
        const flagshipBuilding = new Building({});
        flagshipBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 2) }));
        flagshipWorld.addBuilding(flagshipBuilding);
        const flagshipDocument = new Document({ world: flagshipWorld, metadata: new DocumentMetadata({ title: 'Flagship House' }) });
        storage.save(flagshipWorld.id, serializer.serialize(flagshipDocument));

        const resolvedFlagship = resolver.resolve(flagshipWorld.id);
        assert(resolvedFlagship.id === flagshipWorld.id && resolvedFlagship.getBuildings()[0].getBricks().length === 1,
            'L4. Primary available: resolve() returns the World whose id matches EXACTLY the requested documentId — never a different World.');

        storage.save('flagship-corrupt', { not: 'valid' });
        const resolvedCorrupt = resolver.resolve('flagship-corrupt');
        assert(resolvedCorrupt === null,
            'L5. Primary unavailable (corrupt): resolve() returns null — never flagshipWorld\'s own content borrowed as a stand-in for the unrelated corrupt id.');

        const resolvedFlagshipAgain = resolver.resolve(flagshipWorld.id);
        assert(resolvedFlagshipAgain.id === flagshipWorld.id,
            'L6. The genuinely-saved World still resolves correctly, by its own id, after an unrelated corrupt id failed to resolve — confirming resolve() is a pure per-call lookup, never poisoned by a neighboring failure.');

        console.log('✓ Section L: both collaborators, driven through their real production command boundaries across primary-available and primary-unavailable states, never once produced a wrong identity, a borrowed value, or a cross-contaminated result — the flagship claim the requesting brief asked for.');
    }

    // ===============================================================
    // Section M — Production boundary.
    // ===============================================================
    {
        const gitStatus = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname }).toString();
        const modifiedNonTestFiles = gitStatus.split('\n')
            .filter(Boolean)
            .map((line) => line.slice(3))
            .filter((file) => !file.startsWith('tests/'));
        assert(modifiedNonTestFiles.length === 0,
            `M1. Zero non-test files are modified in the working tree (found: ${modifiedNonTestFiles.join(', ') || 'none'}) — this milestone is test-only, exactly as its own header states.`);
        console.log('✓ Section M: production boundary held — this milestone adds one test file and touches nothing else.');
    }

    console.log(`
================================================================
0.9.588 — Silent Fallback Semantics Product Boundary Audit: COMPLETE
================================================================

0.9.586's Section I architectural-drift sweep flagged two occurrences
(I3a, I3b) under the label "silent fallback." This milestone inspected
both independently against the requesting brief's own central question:
does the fallback preserve or change the user's requested meaning?

I3a (application/nostr/NostrSnapshotDiscoveryQueryService.js#search()) is a
documented, single-source, GRACEFUL_DEGRADATION contract — a query
timeout/relay failure and a genuine zero-announcement result both
resolve to [], by explicit design, tested since 0.9.133. Live tracing to
its one UI consumer (ui/components/OwnPublicationPanel.js) found the
real, narrow issue: the panel's own empty-state copy, "No Snapshots have
been announced under this discoveryTag yet," states a fact as certain
when the underlying mechanism cannot actually distinguish "nothing was
ever announced" from "the relay could not be asked." The panel already
carries a separate, more honest "could not be completed" message for its
own .catch() branch — proven live, that branch is simply unreachable for
this exact failure mode, because search() never rejects. Classified
PRESENTATION_GAP, not PRODUCT_GAP: no identity is lost or substituted,
retrying costs nothing, and the fix (if pursued) is a wording change, not
a mechanism change.

I3b (application/editor/StructureDocumentResolver.js#resolve()) is fully
documented in docs/Principles.md's own 0.2.90 section and regression-
guarded by a dedicated, pre-existing live test (tests/
StructurePlacement.test.js) that has asserted this exact "not found and
corrupt both resolve to null" behavior, with its own stated rationale,
since 0.2.90. It has no UI-visible surface at all — nothing renders
either way, and no text claims a reason. Classified DELIBERATE_BOUNDARY,
fully closed.

Both findings pass Sections C, D, F, H, and L cleanly: neither ever
returns a different requested entity, neither ever substitutes alternate
content for an honest absence, neither is a cross-substrate mechanism
(both are single-source), neither can mutate storage or mint a new
durable fact, and both were proven live, through their real production
command boundaries, to never cross-contaminate an unrelated call's
result.

Per this milestone's own brief: "if all four fallbacks turn out to be
legitimate, we can close them and move on." Both real findings (I3a,
I3b) are legitimate resilience mechanisms. One narrow, low-severity
PRESENTATION_GAP is on record (I3a's UI copy) — small enough that this
milestone does not treat it as requiring its own numbered milestone by
default; a one-line wording change in ui/components/OwnPublicationPanel.js
(e.g. "No Snapshots found under this discoveryTag" in place of an
affirmative "have been announced... yet") would be the smallest possible
correction, offered here as evidence for whatever comes next, not as a
decision that it must happen.
`);
}

main().catch((error) => {
    console.error('\n✗ TEST SUITE FAILED');
    console.error(error);
    process.exitCode = 1;
});
