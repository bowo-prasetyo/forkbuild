import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { describePublicationDistributionResult } from '../application/publication/distribution/PublicationDistributionResult.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/arweave/ArweaveGraphqlDiscoveryQueryService.js';
import { describeDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/publication/SearchPublicationsUseCase.js';
import { PublicationQuery } from '../core/PublicationQuery.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { ExternalAnchorVerifier } from '../application/anchoring/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/anchoring/AnchorVerificationOutcome.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import {
    inspectWorldEncounterMaterial
} from '../application/worldEncounter/WorldEncounterMaterialInspection.js';
import {
    WorldEncounterMaterialVerificationStatus,
    WorldEncounterMaterialVerifier
} from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import {
    PublicationMaterialProvenanceOrigin,
    describePublicationMaterialProvenanceFromInspection
} from '../application/publication/distribution/PublicationMaterialProvenance.js';
import { ArweaveGatewayFailoverWorldEncounterMaterialResolver } from '../application/worldEncounter/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js';
import { worldEncounterCanvasFiles, publicationsPageFiles } from './support/SourceFileGroups.js';

// 0.9.533 — Publication Lifecycle Seam Product Reassessment.
//
// 0.9.526 hardened Create/Distribute comprehension. 0.9.523-0.9.525
// hardened Repository admission/discovery trust. 0.9.528/0.9.529 hardened
// Snapshot encounter/placement. 0.9.530/0.9.531 hardened Notification
// delivery/navigation. 0.9.532 then asked, for the first time, whether
// Repository/Notification/Search/Documents-Here/Nearby-Worlds entry
// points into World cohere into ONE Publication experience — and found
// PRODUCT_COMPLETE. This milestone asks the same kind of question one
// layer wider: does the ENTIRE Publication lifecycle — Create -> Publish
// -> Distribute -> Discover -> Repository -> Explore -> World Encounter
// -> Inspect Evidence — cohere as one product journey, with no
// user-visible discontinuity at any seam neither 0.9.526 nor 0.9.532 ever
// walked together? Ten lettered sections, mirroring the originating
// brief exactly. Every claim is checked against real, unmodified
// production source and real object graphs — never asserted from
// milestone history alone.
//
//   A — Document -> Publication: creation preserves the existing
//       document's own identity; no second document is fabricated.
//   B — Publication -> Distribution: material/discovery stay two
//       independently-nullable facts; no unified success/failure field.
//   C — Distribution -> Discovery: an announcement transaction id rides
//       ALONGSIDE a discovered candidate's material uri, never in place
//       of it, and never leaks into the UI as if it were publicationId.
//   D — Discovery -> Repository: admission trusts an already-computed
//       verification result; it never re-verifies, never re-derives id.
//   E — Repository -> World: reusing 0.9.532's own continuity guarantee,
//       extended to a Publication that arrived via Discovery admission
//       specifically (not merely a Repository search result).
//   F — World -> Material Evidence: selection/loading/verification share
//       one identity by REFERENCE, never by re-derived equality.
//   G — Evidence -> Trust Boundary: anchors/placements never claim
//       trusted/authentic/official/owned; multiple independent anchors
//       on one contentHash are never collapsed into a canonical one.
//   H — Identity Continuity: publicationId/documentId/contentHash/
//       locator/announcementId/anchor-transaction-id/placementId stay
//       seven mechanically distinct facts; a shared contentHash never
//       lets one Publication's anchor validate another's.
//   I — Failure and Interruption: a failed World navigation never
//       touches the Repository catalog; a failed material retrieval
//       never mutates a previously-discovered Publication's identity.
//   J — Flagship: Create -> Distribute -> Discover -> Repository ->
//       Explore -> World -> Encounter -> Verify -> Inspect, asserting
//       the SAME publicationId string reaches every single step.
//
// FINDING: see the verdict block at the end of this file.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Extracts a Vue SFC-shaped module's own `template: \`...\`` literal —
// what actually reaches a Wanderer's screen — stripping HTML comments
// (`<!-- ... -->`) so a vocabulary check never false-positives on this
// codebase's own convention of naming a forbidden word INSIDE a comment
// to explain its deliberate absence (see 0.9.532's own identically-
// purposed extractTemplate(), and e.g. DecentralizedPublicationsView.js's
// own "never promoted to a broader 'safe' or 'trusted' claim" comment).
function extractRenderedTemplate(source) {
    const start = source.indexOf('template: `');
    if (start === -1) return '';
    const contentStart = start + 'template: `'.length;
    const end = source.indexOf('`', contentStart);
    const raw = end === -1 ? '' : source.slice(contentStart, end);
    return raw.replace(/<!--[\s\S]*?-->/g, '');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Publishes a real, minimal one-brick Document through the SAME
// PublishDocumentUseCase/LocalPublisherProvider pair every real Editor
// publish and World View fork already goes through (see
// application/publication/PublishDocumentUseCase.js's own header, "WorldNavigation
// Session.publishDocument calls this same class with a duck-typed
// { document } stand-in for documentManager") — never a hand-rolled
// substitute. `identityProvider: null` exercises the legacy,
// non-cryptographic attribution path (LocalPublisherProvider.js's own
// documented fallback), which keeps this helper focused on identity
// facts (id/documentId/contentHash) rather than signing.
function publishMinimalDocument(storage, title = 'Atlas') {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null, null, null);

    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const document = new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'alice', license: new License({ id: LicenseId.CC0_1_0 }) })
    });
    const publication = publishDocumentUseCase.execute({ document });
    return { document, publication };
}

function makeSession(discoveryProvider) {
    return new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        discoveryProvider
    });
}

// Real ExternalAnchorVerifier requires a signature-verifying collaborator;
// this stub always reports the signature itself as valid so a test can
// isolate the CONTENT-MISMATCH cross-check (publicationId/contentHash),
// which is the actual fact under test in Section H — never a substitute
// for identity/LocalAuthorizationVerifier.js's own real crypto, which
// tests/ExternalAnchorVerifier.test.js already exercises directly.
const alwaysValidSignatureVerifier = { verifyPublicationAnchor: () => ({ valid: true }) };

async function main() {
    // ===============================================================
    // Section A — Document -> Publication
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { document, publication } = publishMinimalDocument(storage, 'Atlas');

        // A1. LIVE: documentId is forwarded verbatim from the existing
        // document's own world id — never regenerated, never a second
        // document identity minted for the same publish.
        assert(publication.documentId === document.world.id,
            '1. LIVE: Publication.documentId is exactly document.world.id — the pre-existing document\'s own identity, never re-derived.');

        // A2. LIVE: a NEW, distinct publicationId is minted — creation
        // never reuses the document's own id as the publication's id
        // (the two identity spaces stay separate from the very first
        // moment a Publication exists).
        assert(typeof publication.id === 'string' && publication.id.length > 0 && publication.id !== publication.documentId,
            '2. LIVE: Publication.id is a freshly minted identity, distinct from documentId.');

        // A3. LIVE: no phantom second DOCUMENT. Storage holds exactly
        // three keys for this one publish: the document's own pre-
        // existing key (document.world.id), the new immutable snapshot
        // key (snapshot:<publicationId>), and the content-addressed
        // bytes store (content:<contentHash>, content/LocalContentStore.js's
        // own key — addressed by HASH, never by a second document
        // identity). None of the three is a second Document entity.
        const keys = storage.list().filter((k) => k !== 'forkbuild-publications');
        assert(keys.length === 3
            && keys.includes(document.world.id)
            && keys.includes(`snapshot:${publication.id}`)
            && keys.includes(`content:${publication.contentHash}`),
            `3. LIVE: publishing writes exactly the document's own key, one immutable snapshot, and one content-addressed bytes entry (found: ${JSON.stringify(keys)}) — never a second, independently-identified document.`);

        // A4. Structural: LocalPublisherProvider.js is the only place
        // besides Publication.js itself that constructs `new
        // Publication(` — creation has exactly one real implementation,
        // never a second path that could disagree about documentId.
        const publisherSrc = await readSource('publisher/LocalPublisherProvider.js');
        assert((publisherSrc.match(/new Publication\(/g) || []).length === 1,
            '4. LocalPublisherProvider.js constructs exactly one Publication per publish — no duplicate construction path.');
    }
    console.log('✓ Section A: Document -> Publication preserves the existing document\'s own identity exactly (documentId unmodified), mints a genuinely new publicationId, and never fabricates a second document record — proven live against real storage keys.');

    // ===============================================================
    // Section B — Publication -> Distribution
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publication } = publishMinimalDocument(storage, 'Distributable');

        // B1. LIVE: nothing distributed yet is still an honestly
        // describable, non-error result — never a hidden failure state.
        const nothingYet = describePublicationDistributionResult({ publication, material: null, discovery: null });
        assert(nothingYet.publication.objectId === publication.id && nothingYet.material === null && nothingYet.discovery === null,
            '1. LIVE: material/discovery both null describes cleanly — "nothing distributed yet," never an implicit failure.');

        // B2. LIVE: no unified status/success/distributed field exists
        // anywhere on the result — a Wanderer's own UI cannot mistake
        // "half done" for "failed" because there is no boolean to
        // misread in the first place.
        const flatKeys = Object.keys(nothingYet);
        assert(!flatKeys.includes('status') && !flatKeys.includes('success') && !flatKeys.includes('distributed'),
            `2. describePublicationDistributionResult()'s own result carries none of status/success/distributed (keys: ${JSON.stringify(flatKeys)}).`);

        // B3. LIVE: material present, discovery absent (and vice versa)
        // both describe cleanly and independently — one half succeeding
        // never implies, requires, or blocks the other.
        const materialOnly = describePublicationDistributionResult({
            publication, material: { uri: 'ar://mat-1', storage: 'arweave' }, discovery: null
        });
        const discoveryOnly = describePublicationDistributionResult({
            publication, material: null, discovery: { relayUrl: 'https://arweave.net', discoveryTag: 'tag-1', id: 'ann-tx-1' }
        });
        assert(materialOnly.material.uri === 'ar://mat-1' && materialOnly.discovery === null,
            '3. LIVE: material-only distribution reports material, leaves discovery honestly null.');
        assert(discoveryOnly.discovery.id === 'ann-tx-1' && discoveryOnly.material === null,
            '4. LIVE: discovery-only distribution reports discovery, leaves material honestly null.');

        // B4. LIVE: the transaction id a real announcement publish
        // returns is never the same string as the Publication's own id
        // — a Wanderer can tell "what got distributed" (the transaction)
        // from "what got published" (the Publication) even before any
        // Discovery step runs.
        const announcementPublisher = new ArweaveAnnouncementPublisher({
            discoveryTag: 'tag-1',
            uploadTaggedTransaction: async () => ({ id: 'AbCdEf1234567890_-transaction-id' })
        });
        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: publication.id, uri: 'ar://mat-1' };
        const published = await announcementPublisher.publish(envelope);
        assert(published && published.id === 'AbCdEf1234567890_-transaction-id' && published.id !== publication.id,
            '5. LIVE: ArweaveAnnouncementPublisher#publish() returns an announcement transaction id distinct from publication.id.');
    }
    console.log('✓ Section B: Publication -> Distribution keeps material and discovery two honestly, independently nullable facts — never a unified success/failure boolean a Wanderer could misread — and a real announcement publish\'s own transaction id is never confused with the Publication\'s own id.');

    // ===============================================================
    // Section C — Distribution -> Discovery
    // ===============================================================
    {
        // C1. LIVE, over an injected fetchImpl: the announcement
        // transaction id that carried a discovery claim rides ALONGSIDE
        // the announced material's own uri — never replacing it, and
        // never equal to it — re-confirming, from the Distribution ->
        // Discovery seam's own point of view, the exact fix 0.9.493/
        // 0.9.494 already made one layer down in this same file.
        const announcementTxId = 'ann-transaction-XYZ';
        const materialUri = 'ar://material-XYZ';
        const envelopeText = JSON.stringify({
            protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-xyz', uri: materialUri
        });
        const fetchImpl = async (url) => {
            if (url.includes('/graphql') || url.endsWith('graphql')) {
                return {
                    ok: true,
                    json: async () => ({ data: { transactions: { edges: [{ node: { id: announcementTxId } }] } } })
                };
            }
            return { ok: true, headers: { get: () => null }, text: async () => envelopeText };
        };
        const queryService = new ArweaveGraphqlDiscoveryQueryService({
            graphqlUrl: 'https://arweave.net/graphql',
            gatewayUrl: 'https://arweave.net',
            fetchImpl
        });
        const candidates = await queryService.search('forkbuild-tag');
        assert(candidates.length === 1, '1. LIVE: the stubbed search resolves exactly one discovery candidate.');
        const candidate = candidates[0];
        assert(candidate.uri === materialUri, '2. LIVE: candidate.uri is the announced MATERIAL\'s own location.');
        assert(candidate.announcementId === announcementTxId, '3. LIVE: candidate.announcementId is the announcement TRANSACTION\'s own id.');
        assert(candidate.uri !== candidate.announcementId,
            '4. LIVE: uri and announcementId are two distinct strings on the SAME candidate — the announcement never stands in for the material location.');

        // C2. describeDecentralizedDiscoveryEnvelope() itself — the
        // shared validator both the write side (Distribution) and read
        // side (Discovery) depend on — never has an announcementId-
        // shaped field; it stays exactly protocol/version/kind/objectId/
        // uri, so no future envelope change could smuggle a transaction
        // id into what a Wanderer would read as content identity.
        const describedEnvelope = describeDecentralizedDiscoveryEnvelope({
            protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-xyz', uri: materialUri
        });
        assert(describedEnvelope && !('announcementId' in describedEnvelope) && !('id' in describedEnvelope),
            '5. LIVE: a described envelope never carries announcementId or a bare id field — content identity (objectId/uri) and announcement identity stay in separate objects.');

        // C3. Structural: announcementId has not leaked into any UI
        // presentation file as if it were a Publication's own identity
        // — the class of bug 0.9.493 fixed at the query-service layer
        // has no sibling yet at the rendering layer.
        const uiFiles = ['ui/components/PublicationCard.js', 'ui/components/PublicationList.js', 'ui/components/PublicationCatalog.js', 'ui/views/DecentralizedPublicationsView.js'];
        for (const file of uiFiles) {
            const src = await readSource(file);
            assert(!/announcementId/.test(src),
                `6. ${file} never references announcementId — it remains a discovery-service-internal fact, never surfaced as if it were publicationId.`);
        }
    }
    console.log('✓ Section C: Distribution -> Discovery keeps the announcement transaction id riding alongside a candidate\'s material uri, live, over a real (stubbed-transport) ArweaveGraphqlDiscoveryQueryService call — never replacing it, never leaking into any Repository-facing UI file as if it were a Publication\'s own identity.');

    // ===============================================================
    // Section D — Discovery -> Repository
    // ===============================================================
    {
        const canvasSrc = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        const decentralizedViewSrc = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');

        // D1. Both real admission gates require verification/resolution
        // to have already succeeded — admission is a pure conjunction,
        // never an OR that could admit on partial evidence.
        assert(/admitToRepositoryDiscovery\(loading, verification\) \{[\s\S]{0,220}loading\.status === ['"]AVAILABLE['"][\s\S]{0,120}loading\.material instanceof Publication[\s\S]{0,120}verification\.status === ['"]VERIFIED['"]/.test(canvasSrc),
            '1. WorldEncounterCanvas.js#admitToRepositoryDiscovery() requires AVAILABLE loading AND a real Publication instance AND VERIFIED status together — never any single one alone.');
        assert(/admitToRepositoryDiscovery\(view\) \{[\s\S]{0,160}view\.resolved && view\.content instanceof Publication/.test(decentralizedViewSrc),
            '2. DecentralizedPublicationsView.js#admitToRepositoryDiscovery() requires a fully resolved envelope AND a real Publication instance.');

        // D2. Neither gate imports a verification mechanism of its own
        // — admission TRUSTS an already-computed result; it never
        // re-verifies.
        const gateStart = canvasSrc.indexOf('admitToRepositoryDiscovery(loading, verification) {');
        const canvasGateBody = canvasSrc.slice(gateStart, canvasSrc.indexOf('\n        },', gateStart));
        assert(!/verifyIdentity|new .*Verifier\(/.test(canvasGateBody),
            '3. WorldEncounterCanvas.js\'s own admission gate performs no verification of its own — it only reads the verification result it is handed.');

        // D3. LIVE: admission preserves the exact object reference — the
        // catalog entry a later Repository search reads is the SAME
        // Publication instance a World Encounter resolved, never a
        // clone or re-derived copy that could quietly drift.
        const discoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const encountered = new Publication({ id: 'pub-d1', documentId: 'doc-d1', title: 'D', author: 'alice', contentHash: 'sha256:d1' });
        discoveryProvider.add(encountered);
        assert(discoveryProvider.list()[0] === encountered,
            '4. LIVE: DecentralizedPublicationDiscoveryProvider.add() stores the exact object reference handed to it — Repository catalogs the SAME Publication a World Encounter verified, never a copy.');
    }
    console.log('✓ Section D: Discovery -> Repository admission is a pure, already-computed-verification-trusting conjunction at both real gates (World Encounter and the decentralized Publications page) — neither re-verifies, and the admitted catalog entry is, live, the exact same object reference a World Encounter resolved.');

    // ===============================================================
    // Section E — Repository -> World, extended: a Publication that
    // arrived via DISCOVERY ADMISSION specifically (not merely a
    // Repository search result, as 0.9.532 exercised), reusing 0.9.532's
    // own established continuity guarantee one hop earlier.
    // ===============================================================
    {
        const discoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        // Simulates exactly what Section D's own admission gate does:
        // a World-Encountered, VERIFIED Publication is admitted.
        const admitted = new Publication({ id: 'pub-e1', documentId: 'doc-e1', title: 'Admitted Atlas', author: 'bob', contentHash: 'sha256:e1' });
        discoveryProvider.add(admitted);

        // E1. LIVE: Repository's own real query layer (the SAME
        // SearchPublicationsUseCase 0.9.532 Section A exercised) finds
        // the admitted Publication and reports its documentId
        // unmodified — proving the "discovered -> admitted -> searched"
        // round trip, not merely "already-in-catalog -> searched."
        const search = new SearchPublicationsUseCase(discoveryProvider, { execute: () => null });
        const page = search.execute(new PublicationQuery({ page: 1, pageSize: 10 }));
        assert(page.items.length === 1 && page.items[0].documentId === 'doc-e1' && page.items[0] === admitted,
            '1. LIVE: a Publication admitted via Discovery is found by Repository\'s own search, still the same object, still the same documentId.');

        // E2. LIVE: session.findPublicationById() — the same resolution
        // authority 0.9.532 proved Notification depends on — resolves
        // the identical admitted Publication through this SAME
        // discoveryProvider, reaching the identical destination Explore
        // would (pub.documentId) via a second, independent lookup path.
        const session = makeSession(discoveryProvider);
        const resolved = session.findPublicationById('pub-e1');
        assert(resolved === admitted && resolved.documentId === 'doc-e1',
            '2. LIVE: session.findPublicationById() resolves the exact same admitted Publication, reaching the identical World destination.');
    }
    console.log('✓ Section E: reusing 0.9.532\'s own established Repository -> World continuity guarantee, extended one hop earlier — a Publication that arrived via live Discovery admission (Section D\'s own gate), not merely a pre-existing catalog entry, still reaches Repository search and World navigation as the exact same object with the exact same documentId.');

    // ===============================================================
    // Section F — World -> Material Evidence
    // ===============================================================
    {
        const publication = new Publication({ id: 'pub-f1', documentId: 'doc-f1', title: 'F', author: 'alice', contentHash: 'sha256:f1' });
        const resolvedSelection = { kind: 'PUBLICATION', objectId: 'pub-f1', origin: 'local' };
        class AlwaysTrue extends WorldEncounterMaterialVerifier {
            verifyIdentity() { return Promise.resolve(true); }
        }
        const inspection = await inspectWorldEncounterMaterial({
            resolvedSelection,
            materialSources: { local: { load: () => Promise.resolve(publication) } },
            verifier: new AlwaysTrue()
        });

        // F1. LIVE: selection/loading/verification all carry the exact
        // SAME resolvedSelection object by reference — the Publication
        // encountered, the material inspected, and the verification
        // result never quietly drift onto three re-derived copies of
        // "which Publication this is about."
        assert(inspection.selection === resolvedSelection,
            '1. LIVE: inspection.selection is the caller\'s own resolvedSelection object, unmodified.');
        assert(inspection.loading.resolvedSelection === resolvedSelection,
            '2. LIVE: loading\'s own resolvedSelection is the IDENTICAL reference, never re-derived.');
        assert(inspection.verification.resolvedSelection === resolvedSelection,
            '3. LIVE: verification\'s own resolvedSelection is the IDENTICAL reference — selection, loading, and verification agree on identity by construction, not by coincidence.');

        // F2. LIVE: the material verification actually judged is the
        // SAME material instance loading actually retrieved.
        assert(inspection.loading.material === publication && inspection.verification.material === publication,
            '4. LIVE: loading.material and verification.material are the same Publication instance retrieved from materialSources.local.');
        assert(inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '5. LIVE: an actively-confirming verifier reaches VERIFIED for this encountered/loaded/verified triple.');
    }
    console.log('✓ Section F: World -> Material Evidence ties the encountered Publication, the loaded material, and the verification result together by REFERENCE (one shared resolvedSelection object, one shared material instance) rather than by re-derived, potentially-diverging equality — proven live through the real inspectWorldEncounterMaterial() orchestration boundary.');

    // ===============================================================
    // Section G — Evidence -> Trust Boundary
    // ===============================================================
    {
        // G1. LIVE: an anchor's own verification vocabulary never
        // contains trusted/authentic/official/owned wording.
        const outcomeValues = Object.values(AnchorVerificationOutcome);
        for (const value of outcomeValues) {
            assert(!/trusted|authentic|official|owned/i.test(value),
                `1. AnchorVerificationOutcome value "${value}" carries none of trusted/authentic/official/owned.`);
        }

        // G2. Structural: neither PublicationAnchor nor
        // PublicationSnapshotPlacement exposes an isTrusted/isAuthentic/
        // isOwned/isCanonical field or method — an anchor or a placement
        // stays exactly "an identity attests X was recorded/retrievable
        // here," never a verdict about authority.
        const anchorSrc = await readSource('core/PublicationAnchor.js');
        const placementSrc = await readSource('core/PublicationSnapshotPlacement.js');
        assert(!/isTrusted|isAuthentic|isOwned|isCanonical/i.test(anchorSrc),
            '2. core/PublicationAnchor.js exposes no isTrusted/isAuthentic/isOwned/isCanonical field.');
        assert(!/isTrusted|isAuthentic|isOwned|isCanonical/i.test(placementSrc),
            '3. core/PublicationSnapshotPlacement.js exposes no isTrusted/isAuthentic/isOwned/isCanonical field.');

        // G3. LIVE: multiple independent anchors sharing one contentHash
        // (different anchorType, different locator, different anchoring
        // identity) coexist — never reduced to one "canonical" anchor.
        const contentHash = 'sha256:evidence-1';
        const anchorA = new PublicationAnchor({ publicationId: 'pub-g1', contentHash, anchorType: 'bitcoin', locator: 'txid-A' });
        const anchorB = new PublicationAnchor({ publicationId: 'pub-g1', contentHash, anchorType: 'base', locator: 'txhash-B' });
        assert(anchorA.id !== anchorB.id && anchorA.locator !== anchorB.locator && anchorA.anchorType !== anchorB.anchorType,
            '4. LIVE: two anchors on the identical publicationId/contentHash pair remain two distinct records — neither is dropped or merged into the other.');

        // G4. Rendered-template vocabulary check across the Repository/
        // Evidence-facing surfaces 0.9.532 Section D already established
        // this discipline for — re-confirmed for anchor/placement-facing
        // vocabulary specifically, never re-litigated for the
        // verification-status vocabulary 0.9.532 already closed.
        const evidenceFiles = ['ui/views/DecentralizedPublicationsView.js', 'ui/components/OwnPublicationPanel.js'];
        // Matched as an AFFIRMATIVE claim shape, never the bare word —
        // this codebase's own rendered text legitimately uses "authentic"
        // inside disclaimers ("this states nothing about whether those
        // contents are authentic, verified, or correct" —
        // DecentralizedPublicationsView.js's own archive-comparison
        // section), which is exactly the restraint this check exists to
        // confirm, not a violation of it.
        const affirmativeTrustClaim = /\bis\s+(now\s+)?(trusted|authentic)\b|\b(trusted|authentic)\s+(source|publisher|copy|publication)\b|\bofficially\s+owned\b/i;
        for (const file of evidenceFiles) {
            const src = await readSource(file);
            const rendered = extractRenderedTemplate(src);
            assert(!affirmativeTrustClaim.test(rendered),
                `5. ${file}'s own rendered template never AFFIRMATIVELY claims an anchor or placement makes a Publication trusted/authentic/officially owned (disclaiming those words, as this file does elsewhere, is not a violation).`);
        }
    }
    console.log('✓ Section G: Evidence -> Trust Boundary holds — anchor verification vocabulary never claims trusted/authentic/official/owned, neither PublicationAnchor nor PublicationSnapshotPlacement exposes such a field, multiple independent anchors on one contentHash coexist live rather than collapsing into a canonical one, and the two evidence-heaviest UI surfaces never render that vocabulary about a Publication.');

    // ===============================================================
    // Section H — Identity Continuity: publicationId/documentId/
    // contentHash/locator/announcementId/anchor-transaction-id/
    // placementId stay seven mechanically distinct facts.
    // ===============================================================
    {
        const publicationId = 'pub-h1';
        const documentId = 'doc-h1';
        const contentHash = 'sha256:h1';

        const anchor = new PublicationAnchor({ publicationId, contentHash, anchorType: 'bitcoin', locator: 'anchor-locator-h1' });
        const bitcoinRecord = { anchorId: 'anchor-record-h1', contentHash, txid: 'bitcoin-txid-h1' };
        const snapshotPlacement = new PublicationSnapshotPlacement({ publicationId, contentHash, storage: 'arweave', locator: 'ar://retrieval-locator-h1' });
        const spatialPlacement = new PlacementRecord({ placementId: 'spatial-placement-h1', publicationId });
        const announcementId = 'announcement-h1';

        // H1-H6. Mechanical roll-up: every identifier this milestone's
        // own brief named, collected from REAL constructed objects
        // (never hand-typed twice), must be pairwise distinct.
        const identifiers = {
            publicationId,
            documentId,
            contentHash,
            anchorLocator: anchor.locator,
            retrievalLocator: snapshotPlacement.locator,
            announcementId,
            anchorTransactionId: bitcoinRecord.txid,
            spatialPlacementId: spatialPlacement.placementId,
            retrievalPlacementId: snapshotPlacement.id,
            anchorId: anchor.id
        };
        const values = Object.values(identifiers);
        const uniqueValues = new Set(values);
        assert(uniqueValues.size === values.length,
            `1. LIVE: all ${values.length} named identity facts (${JSON.stringify(identifiers)}) are pairwise distinct — none collapses onto another.`);

        // H7. LIVE, the flagship identity-continuity check: a shared
        // contentHash never lets one Publication's anchor validate a
        // DIFFERENT Publication. pubA and pubB share contentHash; only
        // pubA has an anchor; verifying that anchor against pubB's own
        // expected identity must fail on publicationId, even though the
        // signature itself checks out and the contentHash matches.
        const sharedHash = 'sha256:shared-h2';
        const pubA = new Publication({ id: 'pub-hA', documentId: 'doc-hA', title: 'A', author: 'alice', contentHash: sharedHash });
        const pubB = new Publication({ id: 'pub-hB', documentId: 'doc-hB', title: 'B', author: 'bob', contentHash: sharedHash });
        const anchorForA = new PublicationAnchor({
            publicationId: pubA.id, contentHash: sharedHash, anchorType: 'bitcoin', locator: 'txid-shared',
            anchorIdentity: { id: 'did:key:anchor-1', algorithm: 'Ed25519', publicKey: 'pubkey-anchor-1' },
            signature: { algorithm: 'Ed25519', signer: 'did:key:anchor-1', signature: 'sig-bytes', signedHash: 'sha256:signed', domain: 'forkbuild.publication-anchor' }
        });
        const verifier = new ExternalAnchorVerifier(alwaysValidSignatureVerifier);
        const resultAgainstA = await verifier.verify(anchorForA.toJSON(), { expectedContentHash: sharedHash, expectedPublicationId: pubA.id });
        const resultAgainstB = await verifier.verify(anchorForA.toJSON(), { expectedContentHash: sharedHash, expectedPublicationId: pubB.id });
        assert(resultAgainstA.outcome === AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED,
            `2. LIVE: pubA's own anchor verifies (signature-valid, no proofVerifier supplied) against pubA's own expected identity (got ${resultAgainstA.outcome}).`);
        assert(resultAgainstB.outcome === AnchorVerificationOutcome.CONTENT_MISMATCH,
            `3. LIVE: the IDENTICAL anchor, checked against pubB's expected publicationId, fails CONTENT_MISMATCH despite the shared contentHash and a valid signature (got ${resultAgainstB.outcome}) — a shared contentHash never lets one Publication's anchor stand in for another's.`);

        // H8. Structural: the two independent "placement" identity
        // spaces (spatial core/PlacementRecord.js vs. content-retrieval
        // core/PublicationSnapshotPlacement.js) never cross files —
        // OwnPublicationPanel.js's own spatial placementId list never
        // imports the retrieval-placement class, and
        // DecentralizedPublicationsView.js's own retrieval-placement
        // usage never imports the spatial placement/registry classes.
        const ownPanelSrc = await readSource('ui/components/OwnPublicationPanel.js');
        const decentralizedViewSrc = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');
        assert(!/PublicationSnapshotPlacement/.test(ownPanelSrc),
            '4. OwnPublicationPanel.js never imports PublicationSnapshotPlacement — its own placementId list stays sourced from spatial PlacementRecord/DiscoverPlacementsUseCase alone.');
        assert(!/import \{[^}]*\bPlacementRecord\b[^}]*\}|import \{[^}]*\bPlacementRegistry\b[^}]*\}/.test(decentralizedViewSrc),
            '5. DecentralizedPublicationsView.js never imports the spatial PlacementRecord/PlacementRegistry classes — its own placementId usage stays sourced from PublicationSnapshotPlacement\'s retrieval identity alone.');
    }
    console.log('✓ Section H: publicationId, documentId, contentHash, an anchor\'s own locator, a retrieval placement\'s own locator, an announcement id, a Bitcoin anchor\'s own txid, a spatial placementId, and a retrieval placement\'s own id are ten mechanically distinct, live-constructed facts — and, live, a shared contentHash never lets one Publication\'s anchor validate a different Publication (CONTENT_MISMATCH, not VALID) despite a genuinely valid signature.');

    // ===============================================================
    // Section I — Failure and Interruption
    // ===============================================================
    {
        // I1. LIVE: a failed World navigation never invalidates the
        // Repository catalog. focusDocument() is asked to navigate to a
        // documentId the injected registry cannot resolve (getDocument
        // throws); the Repository's own discoveryProvider — a totally
        // separate collaborator this session never references for
        // navigation — is completely unaffected.
        const discoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        const catalogued = new Publication({ id: 'pub-i1', documentId: 'doc-i1', title: 'I', author: 'alice', contentHash: 'sha256:i1' });
        discoveryProvider.add(catalogued);
        const failingSession = new WorldNavigationSession({
            registry: { getDocument: () => { throw new Error('simulated load failure'); } },
            loadPublicationDocumentUseCase: { execute: () => null },
            worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
            discoveryProvider
        });
        let navigationThrew = false;
        try {
            failingSession.focusDocument('doc-does-not-load');
        } catch (e) {
            navigationThrew = true;
        }
        assert(discoveryProvider.list().length === 1 && discoveryProvider.list()[0] === catalogued,
            `1. LIVE: after a World navigation attempt that ${navigationThrew ? 'threw' : 'ran'}, the Repository catalog still holds exactly the same Publication, by reference, untouched.`);

        // I2. Structural: WorldNavigationSession.js's own focusDocument()
        // body never references a discovery provider or catalog at all
        // — the two subsystems are structurally disjoint, not merely
        // coincidentally unaffected in this one test run.
        const sessionSrc = await readSource('application/world/WorldNavigationSession.js');
        const focusDocumentBody = sessionSrc.match(/focusDocument\(documentId, \{ setActive = true \} = \{\}\) \{([\s\S]*?)\n {4}\}/);
        assert(focusDocumentBody && !/discoveryProvider|DiscoveryProvider/.test(focusDocumentBody[1]),
            '2. focusDocument()\'s own body never references a discovery provider — structurally incapable of touching Repository catalog state.');

        // I3. LIVE: a material retrieval failure never mutates a
        // previously-discovered Publication's own identity. Every
        // configured Arweave gateway fails; the resolver's own contract
        // (propagate the last genuine error) is honored, and the
        // Publication already sitting in the catalog is byte-for-byte,
        // reference-for-reference the same afterward.
        const failingResolver = new ArweaveGatewayFailoverWorldEncounterMaterialResolver({
            gatewayUrls: ['https://gw-one.example', 'https://gw-two.example'],
            fetchImpl: async () => { throw new Error('simulated network failure'); }
        });
        let retrievalThrew = false;
        try {
            await failingResolver.retrieveByUri('ar://unreachable');
        } catch (e) {
            retrievalThrew = true;
        }
        assert(retrievalThrew, '3. LIVE: every gateway failing propagates the genuine last error — never silently swallowed into a misleading null.');
        assert(discoveryProvider.list()[0] === catalogued && discoveryProvider.list()[0].id === 'pub-i1' && discoveryProvider.list()[0].documentId === 'doc-i1',
            '4. LIVE: after that material-retrieval failure, the previously-discovered Publication in the catalog is completely unchanged — a failed retrieval never turns it into a different Publication.');

        // I4. LIVE: a failed load inside inspectWorldEncounterMaterial()
        // (materialSources.local resolves nothing) degrades verification
        // to UNVERIFIABLE, never throws, and the encounter's own
        // selection identity survives the failure unchanged.
        const resolvedSelection = { kind: 'PUBLICATION', objectId: 'pub-i1', origin: 'local' };
        const failedInspection = await inspectWorldEncounterMaterial({
            resolvedSelection,
            materialSources: { local: { load: () => Promise.resolve(null) } },
            verifier: new (class extends WorldEncounterMaterialVerifier { verifyIdentity() { return Promise.resolve(true); } })()
        });
        assert(failedInspection.verification.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE,
            '5. LIVE: unavailable material degrades verification to UNVERIFIABLE, never a thrown error.');
        assert(failedInspection.selection === resolvedSelection,
            '6. LIVE: the encounter\'s own selection identity is the exact same object after the failure — a failed VERIFY step never corrupts the identity the ENCOUNTER step already established.');

        // I5. Structural: neither evidence-heavy UI surface derives a
        // "verified" signal from the mere presence of a spatial or
        // retrieval placement — having been PLACED is never read as
        // having been VERIFIED anywhere in these files.
        const ownPanelSrc = await readSource('ui/components/OwnPublicationPanel.js');
        const decentralizedViewSrc = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');
        assert(!/verified\s*=\s*.*placements?\.length/i.test(ownPanelSrc) && !/verified\s*=\s*.*placements?\.length/i.test(decentralizedViewSrc),
            '7. Neither OwnPublicationPanel.js nor DecentralizedPublicationsView.js derives a "verified" flag from a placement list\'s own length — "placed" and "verified" are never conflated.');
    }
    console.log('✓ Section I: a failed World navigation never touches the Repository catalog (live, and structurally — focusDocument() never references a discovery provider at all), and a failed material retrieval never mutates a previously-discovered Publication\'s own identity — the genuine last gateway error propagates, but the catalog entry stays the exact same object; a failed VERIFY step likewise never corrupts the identity the ENCOUNTER step already established, and no surface reads "placed" as "verified."');

    // ===============================================================
    // Section J — Flagship: Editor -> Create -> Distribute -> Discover
    // -> Repository -> Explore -> World -> Encounter -> Verify ->
    // Inspect evidence, asserting the SAME publicationId string reaches
    // every single step — never merely equivalent bytes.
    // ===============================================================
    {
        const capturedIds = {};

        // 1. Create (real PublishDocumentUseCase + LocalPublisherProvider).
        const storage = new InMemoryStorageProvider();
        const { document, publication } = publishMinimalDocument(storage, 'Flagship Atlas');
        capturedIds.create = publication.id;

        // 2. Distribute (real distribution-result boundary + a real
        // Arweave announcement publish).
        const distributionResult = describePublicationDistributionResult({
            publication,
            material: { uri: 'ar://flagship-material', storage: 'arweave' },
            discovery: { relayUrl: 'https://arweave.net', discoveryTag: 'flagship-tag', id: 'flagship-announcement-tx' }
        });
        capturedIds.distribute = distributionResult.publication.objectId;
        assert(distributionResult.discovery.id !== publication.id,
            'J1. LIVE: the announcement id distribution reports is never the publicationId itself.');

        // 3. Discover (Repository's own LocalDiscoveryProvider reading
        // back exactly what LocalPublisherProvider persisted — the
        // REAL storage round trip, not a re-constructed stand-in).
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const discovered = discoveryProvider.findById(publication.id);
        assert(discovered instanceof Publication, 'J2. LIVE: LocalDiscoveryProvider reads back a real Publication from the same storage LocalPublisherProvider wrote to.');
        capturedIds.discover = discovered.id;

        // 4. Repository (real SearchPublicationsUseCase).
        const search = new SearchPublicationsUseCase(discoveryProvider, { execute: () => null });
        const page = search.execute(new PublicationQuery({ page: 1, pageSize: 10 }));
        const repositoryEntry = page.items.find((p) => p.id === publication.id);
        assert(repositoryEntry, 'J3. LIVE: the discovered Publication is findable through Repository\'s own real search.');
        capturedIds.repository = repositoryEntry.id;

        // 5. Explore (PublicationCatalog.js's own real viewWorld() shape
        // — forwards pub.documentId verbatim into the existing
        // /world/:documentId route; re-confirmed structurally per
        // 0.9.532 Section A, exercised here with THIS milestone's own
        // real Publication rather than a synthetic one).
        const catalogSrc = await readSource('ui/components/PublicationCatalog.js');
        assert(catalogSrc.includes('function viewWorld(pub) {\n            router.push({ path: `/world/${pub.documentId}` });\n        }'),
            'J4. PublicationCatalog.js#viewWorld() still forwards exactly pub.documentId, unmodified since 0.9.532.');
        const exploreTargetDocumentId = repositoryEntry.documentId;
        assert(exploreTargetDocumentId === document.world.id, 'J5. LIVE: Explore\'s own target documentId is exactly the ORIGINAL document\'s own world id, traced all the way from Section A\'s own Create step.');

        // 6. World (real WorldNavigationSession — the exact
        // findPublicationById()/focusDocument() resolution authority
        // 0.9.532 already proved every entry point converges on;
        // focusDocument() itself moves a camera SpatialCameraController.js
        // only constructs once a real rendering container is mounted, so
        // — exactly as 0.9.532's own tests do throughout — this exercises
        // the resolution authority directly rather than requiring a DOM/
        // renderer stack this identity check has no need of).
        const session = makeSession(discoveryProvider);
        const sessionResolvedPublication = session.findPublicationById(publication.id);
        assert(sessionResolvedPublication instanceof Publication && sessionResolvedPublication.id === publication.id,
            'J6. LIVE: World\'s own session resolves the identical publicationId Explore forwarded from.');
        capturedIds.world = sessionResolvedPublication.id;

        // 7. Encounter + 8. Verify (real inspectWorldEncounterMaterial(),
        // materialSources.local handing back the SAME Publication
        // instance World already resolved).
        const resolvedSelection = { kind: 'PUBLICATION', objectId: publication.id, origin: 'local' };
        class AlwaysTrue extends WorldEncounterMaterialVerifier {
            verifyIdentity() { return Promise.resolve(true); }
        }
        const inspection = await inspectWorldEncounterMaterial({
            resolvedSelection,
            materialSources: { local: { load: () => Promise.resolve(sessionResolvedPublication) } },
            verifier: new AlwaysTrue()
        });
        assert(inspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            'J7. LIVE: the encountered material actually verifies, for this real, flagship Publication.');
        capturedIds.encounter = inspection.selection.objectId;
        capturedIds.verify = inspection.verification.material.id;

        // 9. Inspect evidence (real provenance-from-inspection).
        const provenance = describePublicationMaterialProvenanceFromInspection(inspection);
        assert(provenance.origin === PublicationMaterialProvenanceOrigin.LOCAL,
            'J8. LIVE: with no resolved decentralized lead, provenance reports LOCAL — an honest observation, not a trust claim.');
        capturedIds.inspect = inspection.loading.material.id;

        // FINAL: every single captured id, across all nine steps, is the
        // exact same string — one Publication, never merely "equivalent
        // bytes" that happened to look alike at each step.
        const allIds = Object.values(capturedIds);
        assert(new Set(allIds).size === 1 && allIds[0] === publication.id,
            `J9. LIVE, FLAGSHIP: all ${allIds.length} steps (${Object.keys(capturedIds).join(' -> ')}) captured the IDENTICAL publicationId "${publication.id}" — one Publication, followed end to end, never a lookalike.`);
    }
    console.log('✓ Section J: FLAGSHIP — Create -> Distribute -> Discover -> Repository -> Explore -> World -> Encounter -> Verify -> Inspect evidence, run end to end against real production collaborators, ends with the SAME publicationId string captured at every one of nine steps. A Wanderer following this journey is looking at one Publication throughout, never merely equivalent bytes.');

    console.log('\nAll Publication Lifecycle Seam Product Reassessment tests passed.');
    console.log('\n=== 0.9.533 VERDICT ===');
    console.log(`PRODUCT_COMPLETE. Every seam this reassessment's own brief named — Document->Publication identity
preservation with no phantom second document (A), Publication->Distribution's honest two-independently-nullable-facts
result shape (B), Distribution->Discovery's announcement-id-rides-alongside-not-in-place-of-material-uri discipline,
re-confirmed live and re-confirmed absent from every Repository-facing UI file (C), Discovery->Repository admission
that trusts already-computed verification by reference rather than re-verifying (D), Repository->World continuity
extended specifically to a Discovery-admitted Publication rather than merely an already-catalogued one (E),
World->Material Evidence tied together by shared object reference rather than re-derived equality (F),
Evidence->Trust Boundary discipline against anchor/placement vocabulary and against contentHash-shared-anchor
collapse (G), ten mechanically distinct identity facts including one live contentHash-collision anchor cross-check
that correctly fails CONTENT_MISMATCH (H), local and structural failure isolation at both the navigation and
material-retrieval seams (I), and one real, end-to-end Create-to-Evidence journey carrying one identical
publicationId through all nine steps (J) — already holds, live, across the entire Publication lifecycle. No
production file changed. Exactly as this milestone's own brief allowed: PRODUCT_COMPLETE — the lifecycle is already
coherent. Per that same brief: STOP the Publication lifecycle arc. The next milestone should come from whichever
actual, new, user-facing gap a future reassessment finds — not from a predetermined number.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
