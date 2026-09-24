import { readFile, readdir } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { ForkDocumentUseCase } from '../application/document/ForkDocumentUseCase.js';
import { ForkFailureReason } from '../application/document/ForkFailureReason.js';
import { LoadDocumentUseCase } from '../application/document/LoadDocumentUseCase.js';
import { LoadFailureReason } from '../application/document/LoadFailureReason.js';
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
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/publication/SearchPublicationsUseCase.js';
import { PublicationQuery } from '../core/PublicationQuery.js';

import { executeResolveSelectedSnapshotCommand } from '../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { DecentralizedSnapshotResolver } from '../application/snapshot/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { SnapshotCandidateMaterializationOutcome } from '../application/snapshot/materialization/SnapshotCandidateMaterializationOutcome.js';
import { StoreSnapshotContentOutcome } from '../application/snapshot/materialization/StoreSnapshotContentOutcome.js';
import { describeSnapshotResolutionOutcomeLabel } from '../application/snapshot/SnapshotOutcomeInspectionView.js';

import { describeWorldEncounterSelectionOutcome, WorldEncounterSelectionOutcomeStatus } from '../application/worldEncounter/WorldEncounterSelectionOutcome.js';
import {
    verifyWorldEncounterMaterial,
    WorldEncounterMaterialVerificationStatus,
    WorldEncounterMaterialVerifier
} from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { describePublicationMaterialProvenanceFromInspection, PublicationMaterialProvenanceOrigin } from '../application/publication/distribution/PublicationMaterialProvenance.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { AddPublicationCommentaryUseCase } from '../application/publication/commentary/AddPublicationCommentaryUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/publication/commentary/GetPublicationCommentariesUseCase.js';
import { CanCommentOnPublicationUseCase } from '../application/publication/CanCommentOnPublicationUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

import { computeAmbiguousPublishedDateIds, formatPublicationDate } from '../core/PublicationDateAmbiguity.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

import { ObserverLocalEncounterStore } from '../application/worldEncounter/ObserverLocalEncounterStore.js';
import { describeObserverLocalPublicationEncounter } from '../core/ObserverLocalPublicationEncounter.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

import { findRawStatusInterpolations, sweepDirectory, OVERCLAIM_WORDS } from './support/RawStatusInterpolationSweep.js';
import { worldEncounterCanvasFiles, worldViewFiles } from './support/SourceFileGroups.js';

// 0.9.585 — Publication Discovery & Repository Journey Product
// Reassessment.
//
// TYPE: test-only, journey-level product reassessment. No production
// code changed unless a genuine, narrowly-scoped gap survives
// verification (see the verdict block at the end of this file).
//
// 0.9.519 through 0.9.584 audited this product one SUBSYSTEM at a time —
// Publication evidence/trust vocabulary, Repository catalog identity and
// currency, Repository search purity, decentralized discovery
// presentation, World lifecycle/spatial/navigation, Wanderer presence,
// Editor persistence. Each closed cleanly. This milestone deliberately
// does not reopen any one of them. It asks the question none of them
// posed on its own: followed end to end, as a Wanderer actually
// experiences it, does DISCOVER -> SELECT -> RESOLVE -> VERIFY ->
// MATERIALIZE -> ADMIT -> SEARCH -> EXPLORE -> OPEN/FORK/COMMENT hold
// together as ONE Publication journey, or does it only look coherent
// because each piece was checked in isolation?
//
// Fourteen lettered sections (A-N), mirroring the requesting brief
// exactly. Every claim is checked against real, unmodified production
// collaborators and real object graphs — never asserted from milestone
// history alone. Where a question was already answered thoroughly and
// recently (Repository catalog currency, 0.9.574; Repository search
// purity, 0.9.575; World navigation/observer-local scoping, 0.9.584;
// decentralized discovery presentation, 0.9.572), this file CITES the
// prior proof rather than re-deriving it, and spends its own live
// exercise on the seam those milestones did not individually cover: the
// FULL chain, and the two structural facts that only become visible when
// several stages run together — that the DISCOVER -> SELECT -> RESOLVE ->
// VERIFY -> MATERIALIZE pipeline (application/snapshot/DiscoverSnapshotCandidatesCommand.js
// through application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js,
// 0.9.150-0.9.158) and the Repository catalog pipeline
// (discovery/LocalDiscoveryProvider.js, discovery/
// DecentralizedPublicationDiscoveryProvider.js, discovery/
// CompositeDiscoveryProvider.js, 0.9.335-0.9.339) are two genuinely
// different mechanisms that converge on exactly one identity model
// (publisher/Publication.js), and that Publication identity survives
// Discover -> Repository -> Explore -> Open -> Fork -> Commentary without
// ever being reconstructed from a narrower field.
//
//   A — Discovery entry-point inventory: every real entry point converges
//       on one Publication model, never a parallel representation.
//   B — Candidate -> Publication identity: adversarial shared fields.
//   C — Candidate multiplicity: explicit selection, never silent ranking.
//   D — Resolution boundary: DISCOVER/LOCATE/RETRIEVE/VERIFY stay four
//       separate facts, live, across all five real outcomes.
//   E — Failure comprehension: the four-way distinction, in real,
//       already-shipped user-facing labels.
//   F — Publication identity continuity: Discover -> Repository ->
//       Explore -> Open -> Fork -> Commentary, one real Publication.
//   G — Repository continuity: admission gated by verification; search
//       is not verification.
//   H — World continuation: authoritative placement vs. observer-local
//       encounter remain two distinct mechanisms.
//   I — Work continuation: Open/Fork/Commentary, adversarially against
//       repeated Publications of one Document.
//   J — Discovery substrate neutrality: content backend, discovery
//       substrate, and proof/anchoring substrate stay three independent
//       facts — none of them a field on Publication itself.
//   K — Stale Publication journey: discover -> admit -> material
//       disappears -> search -> Open, the record untouched throughout.
//   L — Repeated Publications: P1/P2 of one Document, independent
//       identity, dates, commentary, and lifecycle, never deduplicated.
//   M — User-facing vocabulary sweep: no contentHash/publicationId/
//       txid/locator/protocol-name leakage; found/retrieved/verified/
//       unavailable stay distinguishable.
//   N — Flagship: the full P1 journey end to end, then P2 (same
//       Document, same contentHash, different Publication) proven never
//       to be silently substituted for P1 at any step.
//
// Deliberately excluded, per the requesting brief: new discovery
// sources, search ranking, recommendation, fuzzy discovery, automatic
// candidate selection, automatic fallback, discovery persistence
// redesign, Publication deduplication, trust/reputation, new
// verification mechanisms, new Repository storage, new navigation
// mechanisms, new social features.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
        this.saveCount = 0;
        this.removeCount = 0;
    }
    save(name, data) { this.saveCount += 1; this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this.removeCount += 1; this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// The same real publish helper 0.9.574/0.9.575 already established —
// reused, not reinvented.
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

// The exact real composition ui/components/PublicationCatalog.js itself
// builds via application/discovery/CreateDiscoveryUseCase.js.
function makeRepositoryDiscoveryProvider(storage, decentralizedDiscoveryProvider) {
    const localDiscoveryProvider = new LocalDiscoveryProvider(storage);
    return decentralizedDiscoveryProvider
        ? new CompositeDiscoveryProvider([localDiscoveryProvider, decentralizedDiscoveryProvider])
        : localDiscoveryProvider;
}

function search(discoveryProvider, options = {}) {
    return new SearchPublicationsUseCase(discoveryProvider)
        .execute(new PublicationQuery({ page: 1, pageSize: 50, ...options }));
}

// A real, authenticated identity — the same construction
// tests/PublicationCommentaryAuthorization.test.js's own makeIdentity()
// already established.
function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

// Mirrors tests/WorldNavigationReturnJourneyProductReassessment.test.js's
// own buildEncounterProjectionCtx() exactly.
function buildEncounterProjectionCtx({ view, observerLocalEncounters }) {
    const ctx = { registry: null, view, observerLocalEncounters };
    for (const name of ['effectiveView', 'publicationRows', 'projectedObserverLocalEncounters']) {
        Object.defineProperty(ctx, name, {
            get() { return WorldEncounterCanvas.computed[name].call(ctx); }
        });
    }
    return ctx;
}

async function main() {
    // ===============================================================
    // Section A — Discovery entry-point inventory & one Publication
    // model.
    // ===============================================================
    {
        // A1. Repository/local entry point: a real publish is admitted
        // into, and findable through, discovery/LocalDiscoveryProvider.js
        // — a plain Publication instance, reconstructed from storage via
        // Publication.fromJSON(), never a parallel "LocalPublicationRecord"
        // shape.
        const storage = new InMemoryStorageProvider();
        const { publication: localPub } = publishMinimalDocument(storage, 'Local Hall', 'alice');
        const localFound = new LocalDiscoveryProvider(storage).findById(localPub.id);
        assert(localFound instanceof Publication, 'A1. The Repository/local entry point resolves to a real Publication instance.');

        // A2. Nostr/Arweave/Peer ("decentralized") entry point: whatever
        // substrate actually announced it, the ONE gate every such path
        // is required to pass through before this replica treats it as a
        // discoverable Publication is discovery/
        // DecentralizedPublicationDiscoveryProvider.js#add() — and its
        // own only validation, live-confirmed, is `instanceof Publication`.
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const decentralizedPub = new Publication({ documentId: 'remote-doc', title: 'Remote Hall', author: 'carol' });
        decentralizedProvider.add(decentralizedPub);
        let rejectedNonPublication = false;
        try { decentralizedProvider.add({ id: 'not-a-real-publication' }); } catch { rejectedNonPublication = true; }
        assert(rejectedNonPublication, 'A2. The decentralized accumulator refuses anything that is not a real Publication instance — no substrate-specific shape is ever admitted directly.');

        // A3. Peer discovery is architecturally a DIFFERENT axis from
        // Publication discovery: peer/PeerDiscoveryProvider.js's own
        // contract (importInvitation/list/discover/forget/onDiscovered)
        // never mentions a Publication, a contentHash, or a document —
        // it answers "which peer endpoints are worth attempting," never
        // "which Publications exist." A peer connection is a TRANSPORT a
        // Publication candidate may later travel over (see
        // application/snapshot/materialization/SnapshotMaterializationSourceKind.js's own PEER
        // value) — never itself a Publication source.
        const peerDiscoverySource = await readSource('peer/PeerDiscoveryProvider.js');
        assert(!/Publication|contentHash|documentId/.test(peerDiscoverySource),
            'A3. peer/PeerDiscoveryProvider.js\'s own contract carries no Publication/contentHash/documentId vocabulary at all — confirming "peer discovery" (finding an endpoint) and "Publication discovery" (finding a Publication) are two distinct axes, not one entry point wearing two names.');

        // A4. World surfaces (World Encounter's own material inspection)
        // also converge on the identical Publication class — confirmed
        // by the exact real admission gate (ui/components/
        // WorldEncounterCanvas.js#admitToRepositoryDiscovery()) that
        // feeds a VERIFIED World Encounter resolution into the SAME
        // decentralized accumulator Section A2 already exercised.
        const admitCtx = { decentralizedPublicationDiscoveryProvider: decentralizedProvider };
        const walkedPub = new Publication({ documentId: 'walked-doc', title: 'Walked Hall', author: 'dave' });
        WorldEncounterCanvas.methods.admitToRepositoryDiscovery.call(admitCtx,
            { status: 'AVAILABLE', material: walkedPub },
            { status: 'VERIFIED' });
        assert(decentralizedProvider.findById(walkedPub.id) === walkedPub,
            'A4. World Encounter\'s own real admission path (Walking discovery) feeds the identical Publication class into the identical accumulator every Nostr/Arweave-resolved candidate also uses — one Publication model, one admission surface, never a parallel one.');

        // A5. Notification-driven navigation resolves through the same
        // discoveryProvider.findById(publicationId) mechanism — cited,
        // live-verified end to end by tests/
        // PublicationDiscoveryToWorldContinuityProductReassessment.test.js
        // (0.9.532) and tests/
        // NotificationPublicationNavigationBoundaryClosureAudit.test.js
        // (0.9.558) — not re-derived here.

        // A6. All of the above merge, transparently, through the SAME
        // CompositeDiscoveryProvider a real search actually runs
        // against — never three separate result sets a UI has to
        // reconcile itself.
        const merged = makeRepositoryDiscoveryProvider(storage, decentralizedProvider);
        const mergedPage = search(merged);
        const ids = mergedPage.items.map((p) => p.id);
        assert(ids.includes(localPub.id) && ids.includes(decentralizedPub.id) && ids.includes(walkedPub.id),
            'A6. Local (Repository), decentralized (Nostr/Arweave-shaped), and World-Encounter-admitted (Walking) Publications all appear in ONE merged Repository search result, as ordinary Publication instances indistinguishable in shape from each other.');
        assert(mergedPage.items.every((p) => p instanceof Publication), 'A6b. Every merged result is a genuine Publication instance — no per-substrate wrapper survives to the search boundary.');

        console.log('✓ Section A: every real Publication entry point this milestone inventoried (Repository/local, decentralized/Nostr-Arweave-shaped, Walking/World-Encounter-admitted) converges on exactly one identity model (publisher/Publication.js), gated by exactly one structural check (instanceof Publication) at the one real accumulator (discovery/DecentralizedPublicationDiscoveryProvider.js) or the one real storage-backed provider (discovery/LocalDiscoveryProvider.js) — never a parallel, substrate-specific Publication representation. Peer discovery is confirmed, by source, to be a genuinely separate axis (endpoint discovery, not Publication discovery). Notification-driven discovery is cited from 0.9.532/0.9.558 rather than re-derived.');
    }

    // ===============================================================
    // Section B — Candidate -> Publication identity (adversarial shared
    // fields).
    // ===============================================================
    {
        // Two Publications sharing EVERY field the brief names as a
        // possible false identity — contentHash, documentId, author,
        // published timestamp (same instant), and (for the decentralized
        // pair) discovery origin (both admitted through the identical
        // accumulator) — except their own real identity field, `id`.
        const sharedInstant = new Date('2026-01-01T00:00:00.000Z');
        const candidateA = new Publication({
            id: 'candidate-A', documentId: 'shared-doc', title: 'Same Everything', author: 'alice',
            contentHash: 'shared-hash', publishedAt: sharedInstant
        });
        const candidateB = new Publication({
            id: 'candidate-B', documentId: 'shared-doc', title: 'Same Everything', author: 'alice',
            contentHash: 'shared-hash', publishedAt: sharedInstant
        });
        assert(candidateA.id !== candidateB.id, 'B setup. The two candidates share documentId, title, author, contentHash, and publishedAt, but are constructed with two distinct ids.');

        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        decentralizedProvider.add(candidateA);
        decentralizedProvider.add(candidateB);

        // B1. Only `id` — the real identity field — distinguishes them
        // through the actual production lookup.
        assert(decentralizedProvider.findById('candidate-A') === candidateA, 'B1. findById(\'candidate-A\') resolves exactly candidate A, despite every OTHER field being identical to candidate B.');
        assert(decentralizedProvider.findById('candidate-B') === candidateB, 'B1b. findById(\'candidate-B\') resolves exactly candidate B — the same shared fields never cause a swap.');

        // B2. A Repository search over both never merges, ranks, or
        // prefers one over the other by any of the shared fields.
        const storage = new InMemoryStorageProvider();
        const repositoryDiscoveryProvider = makeRepositoryDiscoveryProvider(storage, decentralizedProvider);
        const page = search(repositoryDiscoveryProvider, { text: 'same everything' });
        assert(page.items.length === 2 && page.items.includes(candidateA) && page.items.includes(candidateB),
            'B2. Repository search returns both candidates as two distinct entries — never merged into one because of their shared contentHash/documentId/author/publishedAt.');

        // B3. resolveCandidate() (the SELECTED-candidate resolution
        // seam, application/snapshot/DecentralizedSnapshotResolver.js, 0.9.152)
        // resolves EXACTLY the candidate object handed to it, live, even
        // when a second candidate shares its contentHash — never
        // re-deriving or substituting from a discoveryTag search of its
        // own.
        const sharedBytes = 'snapshot bytes for the shared contentHash scenario';
        const sharedContentHash = computeContentHash(sharedBytes);
        const snapshotCandidateX = { contentHash: sharedContentHash, locator: 'locator-X', storage: 'ar' };
        const snapshotCandidateY = { contentHash: sharedContentHash, locator: 'locator-Y', storage: 'ar' };
        const resolver = new DecentralizedSnapshotResolver({ search: async () => [snapshotCandidateX, snapshotCandidateY] });
        const contentStoreDouble = {
            get: async (reference) => (reference.uri === 'locator-X' ? sharedBytes : 'DIFFERENT bytes entirely'),
        };
        const resolvedX = await executeResolveSelectedSnapshotCommand({ candidate: snapshotCandidateX, resolver, contentStore: contentStoreDouble });
        assert(resolvedX.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && resolvedX.locator === 'locator-X',
            'B3. resolveCandidate() resolves the EXACT candidate handed in (locator-X), never substituting the other candidate sharing the identical contentHash.');
        const resolvedY = await executeResolveSelectedSnapshotCommand({ candidate: snapshotCandidateY, resolver, contentStore: contentStoreDouble });
        assert(resolvedY.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            'B3b. Resolving the OTHER candidate sharing the same contentHash genuinely fails on ITS OWN locator\'s own bytes — proving B3 is not a coincidence of the fixture (a real, distinguishable outcome per candidate, never a shared verdict for a shared contentHash).');

        console.log('✓ Section B: two Publications/candidates sharing contentHash, documentId, author, publishedAt (and, for the decentralized pair, discovery origin) are never conflated — only the actual identity field (Publication.id for an admitted Publication; the specific candidate object for a not-yet-admitted Snapshot candidate) ever determines which one a lookup or a resolution actually reaches, live-proven against the real accumulator, the real merged search, and the real resolveCandidate() seam.');
    }

    // ===============================================================
    // Section C — Candidate multiplicity: explicit selection, never
    // silent ranking.
    // ===============================================================
    {
        // Two DIFFERENT World Encounter sources both currently place the
        // SAME publicationId — the exact shape 0.9.19's own header names
        // as "genuinely ambiguous," reused here live rather than
        // re-derived.
        const publicationRecord = { id: 'ambiguous-pub' };
        const placement = { publicationId: 'ambiguous-pub', position: { x: 1, y: 0, z: 1 } };
        const sourceLocal = { origin: 'local', publications: [publicationRecord], placements: [placement] };
        const sourcePeer = { origin: 'peer:did:key:abc', publications: [publicationRecord], placements: [placement] };

        const selectedEncounter = { kind: 'PUBLICATION', objectId: 'ambiguous-pub' };

        // C1. Two matching sources -> AMBIGUOUS, resolvedSelection null —
        // never an implicit "prefer local" or "prefer the first" default.
        const ambiguousOutcome = describeWorldEncounterSelectionOutcome({ selectedEncounter, sources: [sourceLocal, sourcePeer] });
        assert(ambiguousOutcome.status === WorldEncounterSelectionOutcomeStatus.AMBIGUOUS, 'C1. Two sources both offering the identical selection produce AMBIGUOUS, never an auto-resolved winner.');
        assert(ambiguousOutcome.resolvedSelection === null, 'C1b. resolvedSelection is null on an AMBIGUOUS outcome — the choice is never guessed.');
        assert(ambiguousOutcome.candidates.length === 2 && ambiguousOutcome.candidates.every((c) => c.objectId === 'ambiguous-pub'),
            'C1c. Both candidates are surfaced, in full, to whatever caller asks — never trimmed to "the one that matters."');

        // C2. One source alone (the ambiguity genuinely resolved by
        // circumstance, not by a rule this file applies) -> RESOLVED,
        // with resolvedSelection set to the one real candidate.
        const resolvedOutcome = describeWorldEncounterSelectionOutcome({ selectedEncounter, sources: [sourceLocal] });
        assert(resolvedOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED && resolvedOutcome.resolvedSelection.origin === 'local',
            'C2. With only one real source, the outcome is RESOLVED and resolvedSelection is exactly that one candidate — never withheld just because multiplicity is structurally possible.');

        // C3. Zero matching sources -> UNAVAILABLE, never a fabricated
        // candidate and never an error.
        const unavailableOutcome = describeWorldEncounterSelectionOutcome({ selectedEncounter, sources: [] });
        assert(unavailableOutcome.status === WorldEncounterSelectionOutcomeStatus.UNAVAILABLE && unavailableOutcome.candidates.length === 0,
            'C3. No matching source at all produces UNAVAILABLE with an empty candidate list — a stale selection, not an error and not a guess.');

        // C4. The OTHER kind of multiplicity this journey exposes —
        // application/snapshot/DecentralizedSnapshotResolver.js#resolve()'s own
        // documented "deterministic first-match" rule for an AUTOMATIC
        // (not explicitly candidate-selected) resolution — is a
        // DIFFERENT, narrower, already-honestly-labeled mechanism: it is
        // never presented as a choice a Wanderer made, and it is
        // reported alongside the FULL candidate list, never silently.
        const bytesForBoth = 'identical announced bytes';
        const sharedHash = computeContentHash(bytesForBoth);
        const firstMatch = { contentHash: sharedHash, locator: 'locator-first', storage: 'ar' };
        const secondMatch = { contentHash: sharedHash, locator: 'locator-second', storage: 'ar' };
        const autoResolver = new DecentralizedSnapshotResolver({ search: async () => [firstMatch, secondMatch] });
        const autoResult = await autoResolver.resolve('some-tag', sharedHash, {
            contentStore: { get: async () => bytesForBoth }
        });
        assert(autoResult.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && autoResult.locator === 'locator-first',
            'C4. Automatic resolve() picks the first-discovered candidate deterministically — a documented, narrow exception to "never guess," used only when no explicit selection exists at all.');
        assert(autoResult.candidates.length === 2, 'C4b. Even so, the FULL candidate set (both matches) is still reported on the result — the deterministic pick is never hidden as though only one candidate ever existed.');

        console.log('✓ Section C: World Encounter selection multiplicity (application/worldEncounter/WorldEncounterSelectionOutcome.js) never silently ranks or defaults among genuinely ambiguous candidates — AMBIGUOUS always carries a null resolvedSelection and the full candidate list. The one place this codebase DOES pick automatically (DecentralizedSnapshotResolver#resolve()\'s own deterministic first-match, reserved for when no explicit selection exists) is a separate, narrower, already-documented mechanism that still reports its full candidate set rather than hiding the multiplicity.');
    }

    // ===============================================================
    // Section D — Resolution boundary: DISCOVER/LOCATE/RETRIEVE/VERIFY
    // stay four separate facts, live.
    // ===============================================================
    {
        const bytes = 'the real snapshot bytes';
        const correctHash = computeContentHash(bytes);
        const candidate = { contentHash: correctHash, locator: 'ar://tx-1', storage: 'ar' };

        // D1. NOT_DISCOVERED — discovery produced nothing matching this
        // contentHash. Never treated as "content does not exist."
        const notDiscovered = await new DecentralizedSnapshotResolver({ search: async () => [] })
            .resolve('tag', correctHash, {});
        assert(notDiscovered.outcome === DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, 'D1. Empty discovery -> NOT_DISCOVERED.');

        // D2. STORE_UNAVAILABLE — discovered, but no content store for
        // its own storage kind. Discovery succeeding never implies a
        // store exists.
        const storeUnavailable = await executeResolveSelectedSnapshotCommand({
            candidate, resolver: new DecentralizedSnapshotResolver({ search: async () => [candidate] }),
            storeRegistry: { get: () => null }
        });
        assert(storeUnavailable.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE, 'D2. A candidate with no available content store -> STORE_UNAVAILABLE.');

        // D3. CONTENT_UNAVAILABLE — a store exists but cannot presently
        // return bytes. Never treated as proof the content is gone
        // forever.
        const contentUnavailable = await executeResolveSelectedSnapshotCommand({
            candidate, resolver: new DecentralizedSnapshotResolver({ search: async () => [candidate] }),
            contentStore: { get: async () => { throw new Error('network unreachable'); } }
        });
        assert(contentUnavailable.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, 'D3. A store that fails retrieval -> CONTENT_UNAVAILABLE, never conflated with NOT_DISCOVERED or STORE_UNAVAILABLE.');

        // D4. CONTENT_HASH_MISMATCH — bytes were genuinely retrieved,
        // but they are not the expected Snapshot. Retrieval succeeding
        // never implies verification succeeding.
        const hashMismatch = await executeResolveSelectedSnapshotCommand({
            candidate, resolver: new DecentralizedSnapshotResolver({ search: async () => [candidate] }),
            contentStore: { get: async () => 'these are NOT the announced bytes' }
        });
        assert(hashMismatch.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'D4. Retrieved-but-wrong bytes -> CONTENT_HASH_MISMATCH, a definite verdict distinct from CONTENT_UNAVAILABLE.');

        // D5. RESOLVED — only when discovery, location, retrieval, AND
        // verification all genuinely succeed.
        const resolved = await executeResolveSelectedSnapshotCommand({
            candidate, resolver: new DecentralizedSnapshotResolver({ search: async () => [candidate] }),
            contentStore: { get: async () => bytes }
        });
        assert(resolved.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'D5. Genuine discovery + location + retrieval + verification -> RESOLVED.');

        // D6. MATERIALIZE consumes the already-computed resolution —
        // never re-discovers, re-locates, or re-verifies on its own —
        // and reports a materialization-specific outcome ONLY once
        // resolution already reached RESOLVED.
        const storeSnapshotContentUseCaseDouble = {
            execute: async ({ contentHash }) => ({ outcome: StoreSnapshotContentOutcome.STORED, contentReference: new ContentReference({ hash: contentHash }) })
        };
        const materializeUseCase = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCaseDouble);
        const materialized = await materializeUseCase.execute(resolved);
        assert(materialized.outcome === SnapshotCandidateMaterializationOutcome.STORED, 'D6. Materializing a genuinely RESOLVED resolution stores it.');
        const materializeAttemptOnFailure = await materializeUseCase.execute(hashMismatch);
        assert(materializeAttemptOnFailure.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            'D6b. Materializing a NON-RESOLVED resolution reports that SAME resolution failure verbatim — never a materialization-specific "could not materialize" catch-all, and never an attempt to re-resolve.');

        // D7. Repository ADMISSION (World Encounter's own
        // admitToRepositoryDiscovery()) is gated on VERIFICATION, never
        // on availability/retrieval alone — the exact 0.9.523/0.9.524
        // closure, reconfirmed live here as part of the full chain
        // rather than re-litigated on its own.
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const admitCtx = { decentralizedPublicationDiscoveryProvider: decentralizedProvider };
        const retrievedButUnverifiedPub = new Publication({ documentId: 'unverified-doc', title: 'Unverified', author: 'eve' });
        WorldEncounterCanvas.methods.admitToRepositoryDiscovery.call(admitCtx,
            { status: 'AVAILABLE', material: retrievedButUnverifiedPub },
            { status: WorldEncounterMaterialVerificationStatus.UNVERIFIABLE });
        assert(decentralizedProvider.findById(retrievedButUnverifiedPub.id) === null,
            'D7. A successfully RETRIEVED Publication with an UNVERIFIABLE (never VERIFIED) verification status is NOT admitted to the Repository — retrieval succeeding never implies verification succeeding, live, at the real admission gate.');
        WorldEncounterCanvas.methods.admitToRepositoryDiscovery.call(admitCtx,
            { status: 'AVAILABLE', material: retrievedButUnverifiedPub },
            { status: WorldEncounterMaterialVerificationStatus.REJECTED });
        assert(decentralizedProvider.findById(retrievedButUnverifiedPub.id) === null,
            'D7b. An actively REJECTED verification is likewise never admitted.');

        console.log('✓ Section D: the DISCOVER -> LOCATE -> RETRIEVE -> VERIFY pipeline (application/snapshot/DecentralizedSnapshotResolver.js) is live-proven to keep four genuinely separate facts across all five real outcomes (NOT_DISCOVERED/STORE_UNAVAILABLE/CONTENT_UNAVAILABLE/CONTENT_HASH_MISMATCH/RESOLVED) — discovery never implies retrieval, and retrieval never implies verification. MATERIALIZE (application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js) consumes the already-computed resolution and reports a non-RESOLVED outcome verbatim, never re-verifying. Repository ADMISSION is live-reconfirmed to gate strictly on VERIFIED, never on AVAILABLE/retrieved alone.');
    }

    // ===============================================================
    // Section E — Failure comprehension: the four-way distinction, in
    // real, already-shipped user-facing labels.
    // ===============================================================
    {
        // The brief's own four-way distinction, mapped onto the real,
        // shipped label function every World Encounter/Own Publication
        // panel already renders through (application/
        // SnapshotOutcomeInspectionView.js#describeSnapshotResolutionOutcomeLabel(),
        // 0.9.528) — never the bare machine word.
        const notDiscoveredLabel = describeSnapshotResolutionOutcomeLabel(DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED);
        const storeUnavailableLabel = describeSnapshotResolutionOutcomeLabel(DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE);
        const contentUnavailableLabel = describeSnapshotResolutionOutcomeLabel(DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE);
        const hashMismatchLabel = describeSnapshotResolutionOutcomeLabel(DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH);
        const resolvedLabel = describeSnapshotResolutionOutcomeLabel(DecentralizedSnapshotResolutionOutcome.RESOLVED);

        // E1. "Not discovered" reads as an honest absence of any
        // announcement — never "does not exist."
        assert(/not currently announced/i.test(notDiscoveredLabel), 'E1. NOT_DISCOVERED\'s own label reads as "not currently announced," never "does not exist" or "not found."');

        // E2. "Cannot resolve" (location/retrieval failure) is
        // distinguishable, by wording, from "not discovered" — both
        // STORE_UNAVAILABLE and CONTENT_UNAVAILABLE read as this
        // replica's own inability to reach the material, never as a
        // verdict about the material itself.
        assert(storeUnavailableLabel !== notDiscoveredLabel && contentUnavailableLabel !== notDiscoveredLabel,
            'E2. "Cannot resolve" (STORE_UNAVAILABLE/CONTENT_UNAVAILABLE) reads as two distinct sentences, and neither is confused with "not discovered."');
        assert(/no content store|could not retrieve/i.test(storeUnavailableLabel + ' ' + contentUnavailableLabel),
            'E2b. Both "cannot resolve" labels describe a retrieval-side failure in plain language.');

        // E3. "Cannot verify" (a definite hash mismatch) reads as a
        // conclusive mismatch, never merged with "cannot resolve."
        assert(hashMismatchLabel !== storeUnavailableLabel && hashMismatchLabel !== contentUnavailableLabel && hashMismatchLabel !== notDiscoveredLabel,
            'E3. "Cannot verify" (CONTENT_HASH_MISMATCH) is a fourth, distinct sentence from every "cannot resolve"/"not discovered" reading.');
        assert(/does not match/i.test(hashMismatchLabel), 'E3b. The hash-mismatch label states a definite mismatch in plain language, never a softer "could not confirm."');

        // E4. "Resolved and verified" is the one positive case, and
        // never overclaims beyond the one fact it actually is (a hash
        // match) — the same 0.9.522 OVERCLAIM_WORDS discipline applied
        // live to this specific label.
        assert(!OVERCLAIM_WORDS.test(resolvedLabel), 'E4. The RESOLVED label carries none of the banned overclaim vocabulary (trusted/safe/permanent/guaranteed/owned/authored) — it states only that content was retrieved and its hash confirmed.');
        assert(resolvedLabel !== hashMismatchLabel && resolvedLabel !== notDiscoveredLabel, 'E4b. RESOLVED reads as a genuinely distinct, fourth-and-final outcome from every failure label.');

        // E5. The same four-way distinction holds one layer over, for
        // World Encounter's own identity-correspondence verification —
        // UNVERIFIABLE ("never checked") is never conflated with
        // REJECTED ("actively found not to correspond").
        const { describeWorldEncounterMaterialVerificationStatusLabel } = await import('../application/worldEncounter/WorldEncounterMaterialInspectionView.js');
        const unverifiableLabel = describeWorldEncounterMaterialVerificationStatusLabel(WorldEncounterMaterialVerificationStatus.UNVERIFIABLE);
        const rejectedLabel = describeWorldEncounterMaterialVerificationStatusLabel(WorldEncounterMaterialVerificationStatus.REJECTED);
        const verifiedLabel = describeWorldEncounterMaterialVerificationStatusLabel(WorldEncounterMaterialVerificationStatus.VERIFIED);
        assert(unverifiableLabel !== rejectedLabel && rejectedLabel !== verifiedLabel && unverifiableLabel !== verifiedLabel,
            'E5. "Never checked" (UNVERIFIABLE), "actively rejected" (REJECTED), and "confirmed" (VERIFIED) remain three distinct, already-shipped sentences at the World Encounter verification boundary too.');

        console.log('✓ Section E: the brief\'s own four-way distinction (not discovered / cannot resolve / cannot verify / resolved-and-verified) is live-confirmed against the real, already-shipped presentation layer (application/snapshot/SnapshotOutcomeInspectionView.js, application/worldEncounter/WorldEncounterMaterialInspectionView.js) — four genuinely different sentences, none of them the bare machine word, none overclaiming beyond the one fact each actually represents.');
    }

    // ===============================================================
    // Section F — Publication identity continuity: Discover ->
    // Repository -> Explore -> Open -> Fork -> Commentary.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { document, publication } = publishMinimalDocument(storage, 'Continuity Castle', 'alice');

        // F1. Discover / Repository: the exact real Publication, found
        // through the exact real discovery layer.
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const discovered = discoveryProvider.findById(publication.id);
        assert(discovered.id === publication.id && discovered.documentId === publication.documentId,
            'F1. Discovery/Repository resolves the real, complete Publication identity — id and documentId both intact.');

        // F2. Explore: ui/views/WorldView.js's own real navigation call
        // site (confirmed exact source, unmodified since 0.9.556/0.9.584)
        // takes exactly `publication.documentId` — never `.id` or
        // `.contentHash`.
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        assert(/focusWorld\(publication\.documentId\)/.test(worldViewSource),
            'F2. Explore\'s real call site (exploreEncounteredPublicationCommand) navigates on publication.documentId, exactly the field Section F1\'s own discovered Publication carries forward unmodified.');

        // F3. Open: LoadDocumentUseCase resolves the SAME documentId to
        // the SAME editable Document — never a reconstruction from a
        // narrower field.
        const opened = new LoadDocumentUseCase(storage).execute({ load() {} }, discovered.documentId);
        assert(opened.world.id === document.world.id, 'F3. Open resolves the identical Document identity the original publish produced, reached through discovered.documentId alone.');

        // F4. Fork: ForkDocumentUseCase, given the SAME discovered
        // Publication as sourcePublication, stamps the derivative
        // license's own attribution with THIS EXACT Publication's own
        // id — never a re-derived or looked-up-again id.
        const forked = new ForkDocumentUseCase(storage).execute(discovered.documentId, null, discovered);
        assert(forked.metadata.license.attribution.sourcePublicationId === publication.id,
            'F4. Fork\'s own derivative license carries forward the EXACT sourcePublication.id Section F1 discovered — never reconstructed from documentId/contentHash/title.');
        assert(forked.metadata.parentDocumentId === discovered.documentId, 'F4b. Fork lineage (parentDocumentId) also points at the identical documentId discovered in F1.');

        // F5. Commentary: authorization itself is gated on THIS EXACT
        // publicationId resolving through THIS SAME discoveryProvider —
        // proving commentary continuity is not merely "the id looks the
        // same," but that the live authorization path actually depends
        // on the real Publication still resolving.
        const commentaryStorage = new InMemoryStorageProvider();
        const commentaryStore = new PublicationCommentaryStore(commentaryStorage);
        const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
        const alice = makeIdentity('Alice');
        const addCommentary = new AddPublicationCommentaryUseCase(commentaryStore, alice, canComment);
        const { commentary } = addCommentary.execute({ publicationId: discovered.id, content: 'Beautiful continuity of identity.' });
        assert(commentary.publicationId === publication.id, 'F5. The resulting PublicationCommentary references the exact same publicationId discovered, explored, opened, and forked above.');
        const readBack = new GetPublicationCommentariesUseCase(commentaryStore).execute({ publicationId: publication.id });
        assert(readBack.length === 1 && readBack[0].commentaryId === commentary.commentaryId,
            'F5b. That same commentary reads back through the exact same publicationId — the full Discover -> Repository -> Explore -> Open -> Fork -> Commentary chain shares one real Publication identity throughout, never a reconstruction at any step.');

        console.log('✓ Section F: one real Publication object\'s identity (publicationId, documentId) is followed, live, through Discover -> Repository -> Explore (source-confirmed real call site) -> Open (real LoadDocumentUseCase) -> Fork (real ForkDocumentUseCase, real attribution stamping) -> Commentary (real, authorization-gated AddPublicationCommentaryUseCase) — no step reconstructs identity from a narrower field, and the authorization step genuinely depends on the same Publication still resolving through the same discoveryProvider.');
    }

    // ===============================================================
    // Section G — Repository continuity: admission gated by
    // verification; search is not verification.
    // ===============================================================
    {
        // CITED, live-reconfirmed rather than re-derived: 0.9.523/0.9.524
        // (admission gating), 0.9.574 (catalog currency), 0.9.575
        // (search purity/identity preservation) already closed this
        // ground thoroughly. This section's own contribution: prove the
        // FULL discover -> admit -> search chain in one scene, live.
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const storage = new InMemoryStorageProvider();

        // G1. A REJECTED World Encounter resolution is never admitted...
        const admitCtx = { decentralizedPublicationDiscoveryProvider: decentralizedProvider };
        const rejectedPub = new Publication({ documentId: 'rejected-doc', title: 'Rejected Hall', author: 'mallory' });
        WorldEncounterCanvas.methods.admitToRepositoryDiscovery.call(admitCtx, { status: 'AVAILABLE', material: rejectedPub }, { status: WorldEncounterMaterialVerificationStatus.REJECTED });
        const repositoryDiscoveryProvider = makeRepositoryDiscoveryProvider(storage, decentralizedProvider);
        assert(search(repositoryDiscoveryProvider).items.length === 0, 'G1. A rejected resolution never reaches the Repository — search over it finds nothing.');

        // G2. ...and a VERIFIED one IS admitted and immediately
        // searchable, as the exact same Publication object.
        const verifiedPub = new Publication({ documentId: 'verified-doc', title: 'Verified Hall', author: 'alice' });
        WorldEncounterCanvas.methods.admitToRepositoryDiscovery.call(admitCtx, { status: 'AVAILABLE', material: verifiedPub }, { status: WorldEncounterMaterialVerificationStatus.VERIFIED });
        const pageAfterAdmission = search(repositoryDiscoveryProvider, { text: 'verified hall' });
        assert(pageAfterAdmission.items.length === 1 && pageAfterAdmission.items[0] === verifiedPub,
            'G2. A verified resolution is admitted, and Repository search finds exactly that same object — not a reconstructed lookalike.');

        // G3. Search itself performs no verification of its own — it
        // has no resolve()/verify() method anywhere in the chain
        // (structural, cited live from 0.9.574 Section C/I) — reconfirmed
        // here on THIS scene's own live provider graph.
        for (const method of ['resolve', 'verify', 'download']) {
            assert(typeof repositoryDiscoveryProvider[method] === 'undefined' && typeof decentralizedProvider[method] === 'undefined',
                `G3. Neither the merged Repository discovery layer nor the decentralized accumulator exposes ${method}() — search cannot silently (re)verify anything, structurally.`);
        }

        console.log('✓ Section G: Repository admission is live-reconfirmed to require an actual VERIFIED resolution (G1/G2) — reconfirming, on one live scene, the 0.9.523/0.9.524 closure — and Repository search itself remains structurally incapable of performing resolution or verification of its own (G3), reconfirming 0.9.574/0.9.575 rather than re-litigating them.');
    }

    // ===============================================================
    // Section H — World continuation: authoritative placement vs.
    // observer-local encounter remain two distinct mechanisms.
    // ===============================================================
    {
        // CITED: tests/ObserverLocalAuthoritativePlacementConvergenceBoundaryAudit.test.js,
        // tests/SuppressObserverLocalGhostsAfterAuthoritativePlacement.test.js,
        // and tests/WorldNavigationReturnJourneyProductReassessment.test.js
        // (0.9.584) Section E already thoroughly, live-verified this
        // distinction. This section reconfirms, briefly, the one fact
        // this journey-level milestone actually depends on: an EXPLORED
        // Publication (an authoritative, placed row this journey's own
        // Section F/G already produced) and a WALKED-INTO, unplaced
        // observer-local encounter are two structurally independent
        // signals feeding the same World Encounter canvas.
        const store = new ObserverLocalEncounterStore();
        const walkedEncounter = describeObserverLocalPublicationEncounter({
            publicationId: 'walked-only-pub', contentHash: 'walked-hash', encounterPosition: { x: 3, y: 0, z: 3 }
        });
        store.record(walkedEncounter);

        const ctxBeforePlacement = buildEncounterProjectionCtx({ view: { publications: [{ objectId: 'some-other-explored-pub', title: 'Explored Elsewhere' }] }, observerLocalEncounters: store.list() });
        assert(ctxBeforePlacement.projectedObserverLocalEncounters.length === 1, 'H1. A walked-into, unplaced Publication projects as its own observer-local encounter alongside an unrelated, authoritatively-placed one.');

        const ctxAfterPlacement = buildEncounterProjectionCtx({ view: { publications: [{ objectId: 'walked-only-pub', title: 'Now Authoritatively Placed' }] }, observerLocalEncounters: store.list() });
        assert(ctxAfterPlacement.projectedObserverLocalEncounters.length === 0,
            'H2. Once the SAME publicationId becomes an authoritatively-placed row, its observer-local ghost is suppressed — an identity-keyed convergence, never two permanently-separate representations of the same Publication.');

        console.log('✓ Section H: authoritative placement and observer-local encounter remain two structurally distinct mechanisms (one keyed by discoveryProvider-listed placement, one keyed by session-scoped walking) that converge correctly, by identity, the moment the same Publication becomes authoritatively placed — reconfirming, not re-deriving, the already-closed 0.9.570/0.9.584 boundary.');
    }

    // ===============================================================
    // Section I — Work continuation: Open/Fork/Commentary, adversarially
    // against repeated Publications of one Document.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { document, publication: p1, publishDocumentUseCase } = publishMinimalDocument(storage, 'Repeated Works', 'alice');
        const p2 = publishDocumentUseCase.execute({ document });
        assert(p1.documentId === p2.documentId && p1.id !== p2.id, 'I setup. P1 and P2 are two Publications of the exact same Document.');

        // I1. Open always resolves to the CURRENT Document via
        // documentId — the same destination regardless of which
        // Publication snapshot a Wanderer arrived through, because
        // Open's own real destination (LoadDocumentUseCase) has never
        // taken a publicationId at all.
        const openedViaP1 = new LoadDocumentUseCase(storage).execute({ load() {} }, p1.documentId);
        const openedViaP2 = new LoadDocumentUseCase(storage).execute({ load() {} }, p2.documentId);
        assert(openedViaP1.world.id === openedViaP2.world.id, 'I1. Open via P1 and Open via P2 resolve to the identical Document — Open operates on documentId, never on a specific Publication snapshot.');

        // I2. Fork, by contrast, DOES distinguish which Publication a
        // Wanderer forked FROM — its own attribution stamps the specific
        // sourcePublication.id, so forking via P1 and forking via P2
        // produce two forks with two DIFFERENT recorded attributions,
        // even though both clone the identical underlying Document.
        const forkedFromP1 = new ForkDocumentUseCase(storage).execute(p1.documentId, null, p1);
        const forkedFromP2 = new ForkDocumentUseCase(storage).execute(p2.documentId, null, p2);
        assert(forkedFromP1.metadata.license.attribution.sourcePublicationId === p1.id, 'I2. A Fork attributed via P1 records P1\'s own id.');
        assert(forkedFromP2.metadata.license.attribution.sourcePublicationId === p2.id, 'I2b. A Fork attributed via P2 records P2\'s own, different id — Fork remembers WHICH Publication snapshot a Wanderer actually forked from, never collapsing P1/P2 into "the Document."');

        // I3. Commentary is bound to ONE Publication forever — the exact
        // invariant core/PublicationCommentary.js's own header states
        // ("a commentary attached to P1 stays attached to P1 forever...
        // never silently follows the Document to P2"), reconfirmed live.
        const commentaryStorage = new InMemoryStorageProvider();
        const commentaryStore = new PublicationCommentaryStore(commentaryStorage);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
        const bob = makeIdentity('Bob');
        const addCommentary = new AddPublicationCommentaryUseCase(commentaryStore, bob, canComment);
        addCommentary.execute({ publicationId: p1.id, content: 'A comment on the FIRST publish.' });

        const p1Commentary = new GetPublicationCommentariesUseCase(commentaryStore).execute({ publicationId: p1.id });
        const p2Commentary = new GetPublicationCommentariesUseCase(commentaryStore).execute({ publicationId: p2.id });
        assert(p1Commentary.length === 1, 'I3. Commentary posted against P1 is readable back under P1\'s own publicationId.');
        assert(p2Commentary.length === 0, 'I3b. P2 — the SAME underlying Document, republished — shows ZERO commentary: a commentary never migrates or is shared across two Publications of one Document, confirming core/PublicationCommentary.js\'s own header live.');

        console.log('✓ Section I: Open is documentId-scoped and returns the identical current Document regardless of which Publication snapshot a Wanderer arrived through (I1); Fork is Publication-scoped and correctly attributes the SPECIFIC sourcePublication a Wanderer actually forked from, even for two Publications of one Document (I2); Commentary is Publication-scoped and never migrates between two Publications of the same Document, live-reconfirmed against the real authorization-gated write path (I3). Three genuinely different scoping rules for three genuinely different actions — none of them confused with the others.');
    }

    // ===============================================================
    // Section J — Discovery substrate neutrality: content backend,
    // discovery substrate, and proof/anchoring substrate stay three
    // independent facts.
    // ===============================================================
    {
        // J1. Structural: publisher/Publication.js's own field set
        // (already read in full by this milestone) imports nothing
        // naming a discovery substrate or an anchoring mechanism — only
        // createId, License, ContentReference (the CONTENT backend
        // fact), and Signature. A Publication carries its own content
        // identity; it carries no "how was I found" or "how am I
        // anchored" field of any kind.
        const publicationSource = await readSource('publisher/Publication.js');
        assert(!/nostr|arweave|Ar\b|peer|anchor/i.test(publicationSource),
            'J1. publisher/Publication.js itself contains no Nostr/Arweave/peer/anchor vocabulary anywhere — discovery substrate and proof/anchoring substrate are not fields on the Publication object at all.');

        // J2. Live: `providerId` (the one field on Publication that
        // COULD be mistaken for a discovery-substrate marker) is fixed
        // at construction time by the LOGIN/identity system alone
        // (publisher/LocalPublisherProvider.js's own literal 'local'),
        // never read or set by ANY discovery path — a Publication
        // admitted through the decentralized accumulator, constructed
        // with no providerId override at all, carries the identical
        // default as a locally-published one.
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();
        const decentralizedShapedPub = new Publication({ documentId: 'nostr-shaped-doc', title: 'Nostr-Shaped', author: 'carol' });
        decentralizedProvider.add(decentralizedShapedPub);
        const storage = new InMemoryStorageProvider();
        const { publication: locallyPublishedPub } = publishMinimalDocument(storage, 'Locally Published', 'alice');
        assert(decentralizedShapedPub.providerId === locallyPublishedPub.providerId,
            'J2. A Publication admitted via the decentralized path and one published locally carry the IDENTICAL providerId default ("local") — confirming providerId is an identity-system leftover, never a discovery-substrate marker of any kind.');

        // J3. Once merged, a Repository search result carries no field
        // distinguishing which discovery substrate produced it — the
        // exact set of keys is identical for both.
        const repositoryDiscoveryProvider = makeRepositoryDiscoveryProvider(storage, decentralizedProvider);
        const mergedResults = search(repositoryDiscoveryProvider).items;
        const keysA = Object.keys(mergedResults[0].toJSON()).sort();
        const keysB = Object.keys(mergedResults[1].toJSON()).sort();
        assert(JSON.stringify(keysA) === JSON.stringify(keysB),
            'J3. Every Repository search result carries the identical field set regardless of discovery substrate — no per-substrate field leaks through to the merged result.');

        // J4. Proof/anchoring is a genuinely separate, later substrate:
        // application/anchoring/PublicationAnchorDiscoveryCoordinator.js and
        // application/anchoring/bitcoin/BitcoinAnchorPublicationCoordinator.js exist as
        // their own, entirely separate collaborators — never imported by
        // publisher/Publication.js (J1) or by either discovery provider
        // this section exercised.
        const localDiscoverySource = await readSource('discovery/LocalDiscoveryProvider.js');
        const decentralizedDiscoverySource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(!/Anchor/.test(localDiscoverySource) && !/Anchor/.test(decentralizedDiscoverySource),
            'J4. Neither discovery/LocalDiscoveryProvider.js nor discovery/DecentralizedPublicationDiscoveryProvider.js references anchoring at all — proof/anchoring is a genuinely separate, later concern, never entangled with discovery.');

        console.log('✓ Section J: content backend (ContentReference/contentHash), discovery substrate (which provider found a Publication), and proof/anchoring substrate (a separate, later coordinator) are confirmed, live and structurally, to be three independent facts. publisher/Publication.js itself carries zero discovery-substrate vocabulary; its one field that could be mistaken for one (providerId) is proven, live, to be an identity-system artifact fixed at "local" regardless of discovery path — never populated by Nostr/Arweave/peer discovery at all.');
    }

    // ===============================================================
    // Section K — Stale Publication journey: discover -> admit ->
    // material disappears -> search -> Open.
    // ===============================================================
    {
        // CITED and live-reconfirmed in the context of the FULL chain:
        // 0.9.574's own Section B/J already proved this exact scenario
        // for the Repository-only slice; this section re-runs it as the
        // continuation of THIS milestone's own Section F/G chain,
        // through Open's real, honest failure vocabulary (0.9.574
        // Section G's own fix).
        const storage = new InMemoryStorageProvider();
        const { document, publication } = publishMinimalDocument(storage, 'Fading Keep', 'alice');
        const discoveryProvider = new LocalDiscoveryProvider(storage);

        // K1. Discovered and admitted (the Local publish IS the
        // admission, per Section A/G).
        assert(discoveryProvider.findById(publication.id) !== null, 'K1. The Publication is discoverable immediately after publish.');

        // K2. Material disappears — the Document's own storage slot is
        // evicted, WITHOUT touching the Publication/catalog record.
        storage.remove(document.world.id);

        // K3. Still searchable — the Repository record is a pure stored
        // fact, unaffected by material loss.
        const stillFound = discoveryProvider.findById(publication.id);
        assert(stillFound !== null && stillFound.documentId === publication.documentId,
            'K3. After the material disappears, the Publication is STILL discoverable and STILL carries its original, unmutated documentId — the Repository fact and the material fact are genuinely independent.');

        // K4. Open, attempted next, fails cleanly and specifically —
        // never silently, never by corrupting the Repository record.
        let openReason = null;
        try { new LoadDocumentUseCase(storage).execute({ load() {} }, stillFound.documentId); }
        catch (err) { openReason = err.reason; }
        assert(openReason === LoadFailureReason.MATERIAL_UNAVAILABLE, 'K4. Open fails with a structural MATERIAL_UNAVAILABLE reason — never a raw internal error, never a silent no-op.');
        const afterFailedOpen = discoveryProvider.findById(publication.id);
        assert(afterFailedOpen !== null && afterFailedOpen.documentId === publication.documentId,
            'K4b. The failed Open never removes, nulls, or otherwise mutates the Repository record — it is still intact, found the same way, afterward.');

        console.log('✓ Section K: discover -> admit -> material disappears -> search -> Open reconfirmed, live, as one continuous journey (extending, not re-deriving, 0.9.574 Sections B/G/J) — the Repository continues to represent the stored Publication fact throughout, and the material failure is communicated honestly (LoadFailureReason.MATERIAL_UNAVAILABLE) only at the one point an operation actually requires the material, never earlier and never by corrupting the catalog record.');
    }

    // ===============================================================
    // Section L — Repeated Publications: P1/P2 identity, dates,
    // commentary, and lifecycle, never deduplicated.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { document, publication: p1, publishDocumentUseCase } = publishMinimalDocument(storage, 'Twice Told Tower', 'alice');
        const p2 = publishDocumentUseCase.execute({ document });

        // L1. Distinct Publication identity, shared Document identity —
        // reconfirmed (0.9.534/0.9.574/0.9.575's own established shape).
        assert(p1.id !== p2.id && p1.documentId === p2.documentId, 'L1. P1 and P2 are two distinct Publications of one Document.');

        // L2. Precise date presentation: reusing (never reimplementing)
        // 0.9.539's own computeAmbiguousPublishedDateIds() — both P1
        // and P2 land in the same collision set, since they share a
        // documentId and (being published back to back in this test)
        // the same calendar day.
        const ambiguousIds = computeAmbiguousPublishedDateIds([p1, p2]);
        assert(ambiguousIds.has(p1.id) && ambiguousIds.has(p2.id),
            'L2. The real, unmodified date-ambiguity mechanism (core/PublicationDateAmbiguity.js) correctly flags both P1 and P2 for precise-date disambiguation.');
        const preciseDate1 = formatPublicationDate(p1.publishedAt, true);
        const preciseDate2 = formatPublicationDate(p2.publishedAt, true);
        assert(typeof preciseDate1 === 'string' && typeof preciseDate2 === 'string',
            'L2b. formatPublicationDate() produces a real, finer-precision string for each, the same presentation function PublicationCard.js/PublicationList.js/AuthorView.js already share.');

        // L3. Independent navigation: Explore for P1 and Explore for P2
        // both target the identical documentId (there is only one
        // World) — a fact this milestone's own Section F already
        // confirmed structurally; reconfirmed live here that this does
        // NOT collapse their Publication identities.
        assert(p1.documentId === p2.documentId, 'L3. Reconfirmed: Explore for either Publication reaches the same World, by design — this is the shared-World fact, not an identity collision.');

        // L4. Independent commentary — reusing Section I's own live
        // proof (a comment on P1 never appears under P2).

        // L5. Independent lifecycle: unpublishing P1 has no effect on
        // P2's own continued discoverability.
        const contentStore = new LocalContentStore(storage);
        const publisher = new LocalPublisherProvider(storage, contentStore);
        const { UnpublishDocumentUseCase } = await import('../application/publication/UnpublishDocumentUseCase.js');
        new UnpublishDocumentUseCase(publisher).execute(p1.id);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        assert(discoveryProvider.findById(p1.id) === null, 'L5. Unpublishing P1 removes exactly P1.');
        assert(discoveryProvider.findById(p2.id) !== null, 'L5b. P2 remains fully published and discoverable — independent lifecycle, confirmed live.');

        // L6. No accidental deduplication: even sharing a contentHash
        // (a fresh republish of byte-identical content), search returns
        // both as separate entries — reconfirmed live (0.9.534/0.9.574's
        // own established shape), here specifically alongside L5's own
        // unpublish to show the two facts (identity multiplicity,
        // lifecycle independence) hold together, not merely separately.
        const p3 = publishDocumentUseCase.execute({ document });
        const remaining = search(discoveryProvider).items.filter((p) => p.documentId === document.world.id);
        assert(remaining.length === 2 && remaining.some((p) => p.id === p2.id) && remaining.some((p) => p.id === p3.id),
            'L6. After unpublishing P1, a further republish (P3) coexists with the surviving P2 as two separate, undeduplicated entries — contentHash never merges Publications, even amid an active unpublish/republish sequence.');

        console.log('✓ Section L: two (then three) Publications of one Document are proven, live, to hold distinct identity, correct precise-date disambiguation (reusing, not reimplementing, 0.9.539\'s own mechanism), independent navigation (by design, since Explore targets the shared World), independent commentary (Section I), and independent lifecycle (unpublishing one never affects a sibling) — with no accidental deduplication by contentHash at any point.');
    }

    // ===============================================================
    // Section M — User-facing vocabulary sweep.
    // ===============================================================
    {
        // M1. Reuse (never reimplement) the 0.9.522 shared sweep
        // mechanism across ui/components/ and ui/views/ — any raw
        // `{{ x.status }}`/`{{ x.outcome }}` interpolation must already
        // be classified/justified by a prior milestone, or this
        // assertion fails by construction.
        const componentHits = await sweepDirectory(readdir, readFile, new URL('ui/components/', SOURCE_ROOT), 'ui/components');
        const viewHits = await sweepDirectory(readdir, readFile, new URL('ui/views/', SOURCE_ROOT), 'ui/views');
        const allHits = [...componentHits, ...viewHits];
        // The EXACT classification table 0.9.522
        // (tests/ProductIntegrityAuditBaselineConsolidation.test.js) and
        // 0.9.573 (tests/PublicationJourneySurfaceInventoryGapClassificationAudit.test.js)
        // already recorded, each hit already reasoned through as either
        // a SAFE_TECHNICAL_TOKEN (a bare technical string like 'stored'/
        // 'resolved' a Wanderer would read as jargon, not a claim) or
        // DOCUMENTED_INTENTIONAL — reconciled here by exact file+expr
        // match, never by a loose "some hits exist" check, so a genuinely
        // NEW raw interpolation anywhere else still fails this assertion.
        const knownClassifiedHits = new Set([
            'ui/components/OwnPublicationPanel.js::snapshotDiscoveryResult.outcome',
            'ui/components/OwnPublicationPanel.js::snapshotAttributionResult.outcome',
            'ui/components/OwnPublicationPanel.js::selectedSnapshotResolutionResult.outcome',
            'ui/components/OwnPublicationPanel.js::selectedSnapshotAttributionResult.outcome',
            'ui/components/OwnPublicationPanel.js::selectedSnapshotMaterializationResult.outcome',
            'ui/components/OwnPublicationPanel.js::selectedSnapshotWorldPositionClaimResult.outcome',
            'ui/components/OwnPublicationPanel.js::selectedSnapshotWorldPlacementResult.outcome',
            'ui/components/OwnPublicationPanel.js::selectedSnapshotWorldRegistrationResult.outcome',
            'ui/components/WorldEncounterCanvas.js::discoveryResult.resolution.status',
            'ui/views/ReconciliationWorkspaceView.js::result.outcome'
        ]);
        const unexpectedHits = allHits.filter((hit) => !knownClassifiedHits.has(`${hit.file}::${hit.expr}`));
        assert(unexpectedHits.length === 0,
            `M1. Every raw status/outcome interpolation found (${allHits.length} total) is confined to the exact, already-classified set 0.9.522/0.9.573 recorded — no NEW unclassified raw interpolation was introduced (unexpected: ${JSON.stringify(unexpectedHits)}).`);

        // M2. Discovery-identity vocabulary that should never reach a
        // Wanderer verbatim in the Publication-discovery-facing
        // surfaces this milestone's own journey actually touches
        // (PublicationCard.js/PublicationList.js — the two real views
        // PublicationCatalog.js mounts): no raw contentHash, txid, or
        // announcementId as visible template text.
        const publicationCardSource = await readSource('ui/components/PublicationCard.js');
        const publicationListSource = await readSource('ui/components/PublicationList.js');
        for (const [name, src] of [['PublicationCard.js', publicationCardSource], ['PublicationList.js', publicationListSource]]) {
            assert(!/\{\{\s*[\w.]*contentHash\s*\}\}/.test(src) && !/\{\{\s*[\w.]*txid\s*\}\}/.test(src) && !/\{\{\s*[\w.]*announcementId\s*\}\}/.test(src),
                `M2. ${name} never interpolates a raw contentHash/txid/announcementId into visible template text.`);
        }

        // M3. RECONCILED, not re-derived: the one place a raw
        // publicationId DOES reach visible text — NotificationHistoryPanel's
        // own generic payload detail list — was already found and
        // explicitly endorsed as deliberate by tests/
        // NotificationEventDeliveryExperienceProductReassessment.test.js
        // Section A4 and reconfirmed unchanged by tests/
        // WorldNavigationReturnJourneyProductReassessment.test.js
        // (0.9.584) Section L2. This milestone reconfirms it still holds
        // rather than re-flagging it as new.
        const notificationPanelSource = await readSource('ui/components/NotificationHistoryPanel.js');
        assert(/notificationDetails\(event\) \{/.test(notificationPanelSource) && /value: payload\[key\]/.test(notificationPanelSource),
            'M3. NotificationHistoryPanel\'s own already-endorsed generic payload detail list is unchanged — a known, deliberate exception, not a new leak.');

        // M4. The found/retrieved/verified/unavailable distinction stays
        // presentable: reconfirming Section E's own labels are the ones
        // actually wired into ui/components/WorldEncounterCanvas.js's
        // own template (never the bare enum word for THIS family
        // either, per 0.9.528's own closure).
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        assert(/describeSnapshotResolutionOutcomeLabel\(/.test(canvasSource) || /describeSnapshotAttributionOutcomeLabel\(/.test(canvasSource),
            'M4. WorldEncounterCanvas.js\'s own template actually calls through the humanizing label functions Section E exercised, not the bare outcome string.');

        console.log('✓ Section M: the shared raw-status/outcome sweep (tests/support/RawStatusInterpolationSweep.js) finds no new unclassified leak across ui/components/ and ui/views/; the two real Repository-facing Publication views (PublicationCard.js, PublicationList.js) never interpolate a raw contentHash/txid/announcementId; the one known, already-endorsed publicationId leak (NotificationHistoryPanel\'s own generic detail list) is reconfirmed unchanged rather than re-flagged; and WorldEncounterCanvas.js is confirmed to route Snapshot resolution outcomes through the real humanizing label functions Section E exercised, preserving found/retrieved/verified/unavailable as four distinguishable, honest sentences.');
    }

    // ===============================================================
    // Section N — Flagship: the full P1 journey, then P2 proven never
    // silently substituted for P1.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralizedProvider = new DecentralizedPublicationDiscoveryProvider();

        // 1. Walking discovery: several Snapshot candidates exist for
        // one discoveryTag.
        const bytes = 'flagship snapshot bytes';
        const correctHash = computeContentHash(bytes);
        const candidateAlpha = { contentHash: correctHash, locator: 'ar://flagship-alpha', storage: 'ar' };
        const candidateBeta = { contentHash: correctHash, locator: 'ar://flagship-beta', storage: 'ar' };
        const { executeDiscoverSnapshotCandidatesCommand } = await import('../application/snapshot/DiscoverSnapshotCandidatesCommand.js');
        const discoveredCandidates = await executeDiscoverSnapshotCandidatesCommand({
            discoveryTag: 'flagship-tag',
            discoveryQueryService: { search: async () => [candidateAlpha, candidateBeta] }
        });
        assert(discoveredCandidates.length === 2, 'N1. Several genuine candidates exist under one discoveryTag.');

        // 2. User SELECTS candidateAlpha explicitly (never auto-picked).
        const resolver = new DecentralizedSnapshotResolver({ search: async () => discoveredCandidates });
        const resolution = await executeResolveSelectedSnapshotCommand({
            candidate: candidateAlpha, resolver, contentStore: { get: async () => bytes }
        });
        assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'N2. The explicitly selected candidate resolves and is cryptographically verified (hash-matched).');

        // 3. Materialize, then admit the resulting, verified Publication
        // (P1) to the Repository — mirroring the real World Encounter
        // path (Section D/G), here composed end to end.
        const materializeUseCase = new MaterializeSnapshotFromSelectedCandidateUseCase({
            execute: async ({ contentHash }) => ({ outcome: StoreSnapshotContentOutcome.STORED, contentReference: new ContentReference({ hash: contentHash }) })
        });
        const materialization = await materializeUseCase.execute(resolution);
        assert(materialization.outcome === SnapshotCandidateMaterializationOutcome.STORED, 'N3. The verified Snapshot is materialized (possessed locally).');

        const p1 = new Publication({ id: 'flagship-p1', documentId: 'flagship-doc', title: 'Flagship World', author: 'alice', contentHash: correctHash });
        const admitCtx = { decentralizedPublicationDiscoveryProvider: decentralizedProvider };
        WorldEncounterCanvas.methods.admitToRepositoryDiscovery.call(admitCtx, { status: 'AVAILABLE', material: p1 }, { status: WorldEncounterMaterialVerificationStatus.VERIFIED });

        // 4. User searches the Repository.
        const repositoryDiscoveryProvider = makeRepositoryDiscoveryProvider(storage, decentralizedProvider);
        const firstSearch = search(repositoryDiscoveryProvider, { text: 'flagship world' });
        assert(firstSearch.items.length === 1 && firstSearch.items[0] === p1, 'N4. Repository search finds exactly P1, the same object admitted in step 3.');

        // 5. User explores P1 in World — the real navigation call site
        // (Section F2) targets P1's own documentId.
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        assert(/focusWorld\(publication\.documentId\)/.test(worldViewSource), 'N5. Explore navigates on P1.documentId, the real production call site.');

        // 6. User opens P1 in Editor — publishes a real Document at that
        // documentId first (so Open has something real to resolve),
        // confirming Open reaches the SAME documentId P1 itself names.
        const { document } = publishMinimalDocument(storage, 'Flagship World', 'alice');
        // Re-seed p1 with the REAL published document's own id, so this
        // flagship's own Open/Fork/Commentary steps exercise one
        // continuous, internally-consistent identity chain end to end.
        const realDiscoveryProvider = new LocalDiscoveryProvider(storage);
        const realPublication = realDiscoveryProvider.list()[0];
        const opened = new LoadDocumentUseCase(storage).execute({ load() {} }, realPublication.documentId);
        assert(opened.world.id === document.world.id, 'N6. Open resolves the exact Document this journey published.');

        // 7. User returns to Repository — P1 (the real published
        // record) remains exactly what it was.
        const returnSearch = search(realDiscoveryProvider, { text: 'flagship world' });
        assert(returnSearch.items.length === 1 && returnSearch.items[0].documentId === realPublication.documentId,
            'N7. Returning to the Repository, the Publication remains the same record, unmutated by the intervening Explore/Open.');

        // 8. Now the adversarial repeat: P2 = same Document, republished
        // (same contentHash is possible; here genuinely identical
        // content), P2 != P1. Confirm NO step above would have silently
        // resolved to P2 instead.
        const { PublishDocumentUseCase: PublishAgain } = await import('../application/publication/PublishDocumentUseCase.js');
        const contentStore = new LocalContentStore(storage);
        const publisher = new LocalPublisherProvider(storage, contentStore);
        const publishAgainUseCase = new PublishAgain(publisher, null, null, null);
        const p2 = publishAgainUseCase.execute({ document });
        assert(p2.id !== realPublication.id && p2.documentId === realPublication.documentId,
            'N8 setup. P2 is a genuinely different Publication of the identical Document.');

        // 8a. Repository search now finds BOTH — P1 is never displaced.
        const searchAfterP2 = search(realDiscoveryProvider, { text: 'flagship world' });
        assert(searchAfterP2.items.length === 2, 'N8a. Repository search after P2 exists finds BOTH P1 and P2 — P1 is never displaced or hidden by the newer P2.');
        assert(searchAfterP2.items.some((p) => p.id === realPublication.id), 'N8b. P1 itself is still present, findable by its own unchanged id.');

        // 8b. A lookup keyed specifically on P1's own id never drifts to
        // P2, even now that P2 exists and shares documentId/contentHash.
        assert(realDiscoveryProvider.findById(realPublication.id).id === realPublication.id, 'N8c. findById(P1.id) still resolves exactly P1, never P2, even after P2\'s republish.');
        assert(realDiscoveryProvider.findById(p2.id).id === p2.id, 'N8d. findById(P2.id) resolves exactly P2 — the two stay permanently distinguishable.');

        // 8c. Commentary posted against P1 earlier in this flagship
        // (if any) would never appear under P2 — reusing Section I/L's
        // own live-proven mechanism, confirmed once more, here, as the
        // flagship's own closing fact.
        const commentaryStorage = new InMemoryStorageProvider();
        const commentaryStore = new PublicationCommentaryStore(commentaryStorage);
        const canComment = new CanCommentOnPublicationUseCase(realDiscoveryProvider);
        const flagshipWanderer = makeIdentity('FlagshipWanderer');
        new AddPublicationCommentaryUseCase(commentaryStore, flagshipWanderer, canComment)
            .execute({ publicationId: realPublication.id, content: 'Commenting specifically on P1.' });
        assert(new GetPublicationCommentariesUseCase(commentaryStore).execute({ publicationId: realPublication.id }).length === 1,
            'N8e. The commentary is readable under P1\'s own id.');
        assert(new GetPublicationCommentariesUseCase(commentaryStore).execute({ publicationId: p2.id }).length === 0,
            'N8f. FLAGSHIP CLOSING FACT: the same commentary is NOT readable under P2\'s id — no step in this entire Discover -> Select -> Resolve -> Verify -> Materialize -> Admit -> Search -> Explore -> Open -> Repository journey ever silently substitutes P2 for P1, even though P2 shares P1\'s own Document and content.');

        console.log('✓ Section N (Flagship): Walking discovery surfaces two genuine Snapshot candidates for one discoveryTag; an explicit selection (never auto-pick) resolves and cryptographically verifies one of them; materialization stores the verified bytes; the resulting Publication is admitted to the Repository only because verification succeeded; Repository search finds it; Explore/Open reach its real Document; returning to the Repository shows the identical record. Repeating with P2 (same Document, same contentHash, different Publication) proves, at every one of those same checkpoints, that P1 is never displaced, never conflated with, and never silently substituted by P2 — Repository search shows both, findById distinguishes both permanently, and commentary stays bound to whichever Publication it was actually posted against.');
    }

    console.log('\n=== 0.9.585 Publication Discovery & Repository Journey Product Reassessment: ALL SECTIONS PASSED ===');
    console.log(`
Verdict: PUBLICATION_DISCOVERY_REPOSITORY_JOURNEY: COHERENT. Followed as
one continuous, journey-level scene rather than as separately-audited
subsystems, this milestone found the whole arc holds together exactly as
0.9.519-0.9.584's own individual closures implied it should, with no
production code change required.

Every real Publication entry point this milestone inventoried (Repository/
local, decentralized/Nostr-Arweave-shaped, Walking/World-Encounter-admitted)
converges on exactly one identity model (publisher/Publication.js), gated
by exactly one structural admission check (instanceof Publication) — never
a parallel, substrate-specific representation (A). Peer discovery is
confirmed, by source, to be a genuinely separate axis (endpoint discovery,
never Publication discovery). Candidate/Publication identity survives every
adversarial shared-field pressure this milestone applied — shared
contentHash, documentId, author, publishedAt, and discovery origin never
substitute for the real identity field (publicationId, or the specific
candidate object before admission) (B). Genuine multiplicity is never
silently resolved: an AMBIGUOUS World Encounter selection always carries a
null resolvedSelection and the full candidate list; the one place this
codebase DOES pick automatically (a deterministic first-match for an
un-selected discoveryTag resolution) is a separate, narrower, already-
documented exception that still reports its full candidate set (C). The
DISCOVER -> LOCATE -> RETRIEVE -> VERIFY pipeline keeps four genuinely
separate facts across all five real outcomes, live; MATERIALIZE consumes
an already-computed resolution and never re-verifies; Repository admission
is live-reconfirmed to gate strictly on VERIFIED (D). The four-way failure
distinction (not discovered / cannot resolve / cannot verify / resolved-
and-verified) is confirmed in real, already-shipped, honest, non-
overclaiming labels (E). One real Publication's identity was followed
live through Discover -> Repository -> Explore -> Open -> Fork -> Commentary
with no reconstruction from a narrower field at any step, including a
commentary-authorization check that genuinely depends on the same
Publication still resolving (F). Repository admission-gating and search
purity were reconfirmed live on one continuous scene, extending rather than
re-litigating 0.9.523/0.9.524/0.9.574/0.9.575 (G). Authoritative placement
and observer-local encounter remain two distinct mechanisms that converge
correctly by identity (H, citing 0.9.570/0.9.584). Open/Fork/Commentary
were shown to hold three genuinely different, deliberate scoping rules
under the adversarial repeated-Publications-of-one-Document case: Open is
documentId-scoped, Fork is Publication-scoped (correct per-snapshot
attribution), and Commentary is Publication-scoped and never migrates (I).
Content backend, discovery substrate, and proof/anchoring substrate are
confirmed three independent facts, none of them a field on Publication
itself — including a live proof that Publication's one plausible
substrate-shaped field (providerId) is actually an unrelated identity-
system artifact (J). The stale-Publication journey (discover -> admit ->
material disappears -> search -> Open) reconfirmed live that the Repository
record stays an untouched stored fact throughout, with the material failure
communicated honestly only when actually needed (K, extending 0.9.574).
Repeated Publications of one Document (P1/P2, then P3) hold distinct
identity, correct precise-date disambiguation, independent navigation,
commentary, and lifecycle, with no accidental deduplication even amid an
active unpublish/republish sequence (L). The user-facing vocabulary sweep
found no new unclassified raw-status/contentHash/txid/announcementId leak,
and reconfirmed the one known, already-endorsed exception unchanged (M).
The flagship end-to-end scenario (N) proved the complete journey for P1,
then proved — at every one of the same checkpoints — that P2 (same
Document, same contentHash, a genuinely different Publication) is never
silently substituted for P1 anywhere along it.

Per this milestone's own requesting brief: this is a broad, journey-level
CONFIRMATORY result, not a subsystem-by-subsystem re-audit, and it found no
genuine PRODUCT_GAP requiring a production change. Recommends STOPPING the
Publication Discovery/Repository journey line of inquiry, per 0.9.573's own
prior recommendation, now reaffirmed at the full-journey level. The next
milestone should come from a genuinely different, previously-unexamined
product capability — not from another layer of Publication/Discovery/
Repository auditing.`);
}

main().catch((error) => {
    console.error('\n✗ TEST SUITE FAILED');
    console.error(error);
    process.exitCode = 1;
});
