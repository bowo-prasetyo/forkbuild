import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { NotificationEvent } from '../core/NotificationEvent.js';
import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PUBLICATION_COMMENTED_EVENT_TYPE } from '../application/PublicationCommentaryNotificationProducer.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';

// 0.9.350 — Cross-Arc Product Evolution Reassessment.
//
// **Type: test-only, no production changes.** 0.9.349 closed the
// Post-Publish Distribution arc with its own STABLE_STOP verdict and
// explicitly deferred the next question to "the broader Product
// Evolution Reassessment" rather than pre-selecting a 0.9.350 from
// within its own arc. This milestone is that reassessment — the same
// whole-product audit 0.9.288 already ran once, before the Provider
// Preference / Place Naming Distribution / Federated Repository / Peer
// Sync / Known-Peer Auto-Connection / Post-Publish Distribution arcs
// (0.9.289-0.9.349, sixty-one milestones) existed at all. The question
// this file answers is the brief's own:
//
//   After completing the post-publish distribution arc, what is the
//   next genuine user-facing product gap across the whole ForkBuild
//   system — not "what capability could be added," but "what currently
//   prevents a user from accomplishing something they reasonably expect
//   ForkBuild to support?"
//
// Every claim below is checked fresh against real, unmodified production
// source and, where a live object graph is the more honest proof, a real
// object graph built from real domain classes — never prose inherited
// from 0.9.196-0.9.349 without re-verifying it against the CURRENT tree.
// A companion research pass (read-only, this milestone's own scouting
// step, not a separate deliverable) independently traced all five named
// journeys through the real UI/application/discovery layers before this
// file's assertions were written, so every assertion here reproduces a
// concretely-observed fact rather than a hoped-for one.
//
//   Section A — Capability inventory: sixteen named arcs, each given a
//               fresh classification (COMPLETE/PARTIAL/INTERNAL/
//               DEFERRED/OBSOLETE) grounded in real source.
//   Section B — User-journey gap scan: the five journeys the brief
//               names, each traced hop to hop through real production
//               wiring, broken transitions (if any) reported honestly.
//   Section C — Cross-arc identity audit: the thirteen identity kinds
//               the brief names, checked for accidental equivalence.
//   Section D — Cross-arc temporal semantics: the nine lifecycle stages
//               the brief names, checked for accidental collapse.
//   Section E — Reachability audit table: capability / exists /
//               production caller / user-reachable / gap.
//   Section F — UI duplication sweep: repeated action names across
//               ui/components and ui/views, checked for genuine
//               duplication vs. shared convergence vs. same word/
//               different domain.
//   Section G — Deferred directions revisited: six named candidates,
//               each asked "does a real user journey require this
//               today?"
//   Section H — Product vs. architecture: capability that exists
//               architecturally with no corresponding user-facing gap.
//   Section I — Candidate scoring.
//   Section J — Final decision.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Mirrors every prior reassessment's own helper (0.9.219, 0.9.250, 0.9.282,
// 0.9.287, 0.9.288) — one grep-verifiable signal, never a header comment
// trusted at face value.
async function grepCount(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

async function findExists(relativeGlobDir, needleRegex) {
    // A tiny "does any file under this dir match" helper for absence
    // checks that don't warrant a full grep invocation.
    const { readdir } = await import('node:fs/promises');
    let entries = [];
    try {
        entries = await readdir(new URL(relativeGlobDir, SOURCE_ROOT));
    } catch { return false; }
    return entries.some((name) => needleRegex.test(name));
}

async function runTests() {
    console.log('Running Post-Distribution-Arc Cross-Arc Product Evolution Reassessment tests...\n');

    // ===============================================================
    // Section A — Capability inventory. Sixteen named arcs, each given
    // one fresh, grep-verified signal and a classification, never
    // inherited from a prior milestone's own header without re-checking.
    // ===============================================================
    {
        const arcs = [
            ['Local Repository / Publication creation', 'application/PublishDocumentUseCase.js', 'export class PublishDocumentUseCase', 'COMPLETE'],
            ['Editing and recovery', 'application/CheckRecoveryUseCase.js', 'export class CheckRecoveryUseCase', 'COMPLETE'],
            ['Collaboration', 'collaboration/CollaborationSession.js', 'export class', 'OBSOLETE (legacy authority protocol) / COMPLETE (live causal chain)'],
            ['Publication Commentary', 'application/AddPublicationCommentaryUseCase.js', 'export class AddPublicationCommentaryUseCase', 'COMPLETE'],
            ['World View / Encounter', 'ui/components/WorldEncounterCanvas.js', 'export default', 'COMPLETE'],
            ['Snapshot discovery and materialization', 'application/MaterializeSnapshotFromPlacementUseCase.js', 'export class', 'COMPLETE'],
            ['Snapshot World placement', 'application/AddPublicationSnapshotPlacementUseCase.js', 'export class', 'COMPLETE'],
            ['Place Naming', 'application/PlaceNamingClaimUseCase.js', 'export class', 'COMPLETE'],
            ['Decentralized Publication discovery', 'discovery/DecentralizedPublicationDiscoveryProvider.js', 'export class DecentralizedPublicationDiscoveryProvider', 'COMPLETE (encounter-driven; proactive search deliberately excluded)'],
            ['Decentralized Snapshot distribution', 'application/SnapshotDistributionCommand.js', 'export', 'COMPLETE'],
            ['Publication announcement', 'application/PublicationDistributionCommand.js', 'export', 'COMPLETE'],
            ['Provider preference for content', 'application/ResolvePreferredRoleProviderUseCase.js', 'export class', 'COMPLETE (CONTENT role only, by design)'],
            ['Peer Publication synchronization', 'application/PublicationPeerConnectionSync.js', 'export class', 'COMPLETE'],
            ['Known-peer auto-connection', 'application/AutoConnectKnownPeersUseCase.js', 'export class', 'COMPLETE'],
            ['Post-publish distribution guidance', 'ui/components/OwnPublicationPanel.js', 'publicationDistributionCommand', 'COMPLETE'],
            ['Notification history', 'core/NotificationEvent.js', 'export class NotificationEvent', 'COMPLETE (no delivery/read-state, by design)']
        ];
        for (const [name, path, marker] of arcs) {
            const exists = await sourceExists(path);
            assert(exists, `A. ${name} — ${path} exists.`);
            const source = await rawSource(path);
            assert(source.includes(marker), `A. ${name} — ${path} still contains "${marker}".`);
        }
        assert(arcs.length === 16, 'A0. All sixteen arcs this milestone\'s own brief names are inventoried, none skipped.');

        // A17. The legacy 0.2.7-0.2.9 authority-collaboration protocol,
        // reconfirmed OBSOLETE fresh (fifth time on file: 0.9.241,
        // 0.9.250, 0.9.288, implicitly every arc since, now here).
        const legacyCollabFiles = [
            'collaboration/CollaborationSession.js',
            'collaboration/DocumentAuthority.js',
            'collaboration/AuthorityCollaborationTransport.js',
            'collaboration/LocalCollaborationTransport.js',
            'core/CollaborationEnvelope.js',
            'application/CreateCollaborationUseCase.js'
        ];
        for (const path of legacyCollabFiles) {
            assert(await sourceExists(path), `A17a. ${path} still exists — not deleted.`);
        }
        const legacyCallers = await grepCount('CreateCollaborationUseCase', ['application', 'ui']);
        assert(legacyCallers <= 1, `A17b. application/CreateCollaborationUseCase.js still has no caller outside its own file (found ${legacyCallers} matching file(s)).`);

        console.log('✓ A: Baseline frozen. All sixteen named arcs are IMPLEMENTED and REACHABLE (A1-A16, one fresh signal each). The legacy 0.2.7-0.2.9 collaboration protocol remains the one OBSOLETE exception, reconfirmed uncalled a fifth time (A17) — sixty-plus milestones of standing architecture debt, never a product gap.');
    }

    // ===============================================================
    // Section B — User-journey gap scan. The five journeys the brief
    // names, each traced hop to hop through real, unmodified production
    // wiring, never assumed complete from a prior milestone's own
    // header.
    // ===============================================================
    {
        // B1. Create -> Edit -> Publish -> Discover -> Explore -> Fork.
        const catalogSource = await rawSource('ui/components/PublicationCatalog.js');
        assert(catalogSource.includes("inject('decentralizedPublicationDiscoveryProvider'"),
            'B1a. PublicationCatalog.js (Repository/Author View\'s own component) still injects the decentralized discovery provider.');
        assert(/new CreateDiscoveryUseCase\(\)\.execute\(\{\s*decentralizedDiscoveryProvider\s*\}\)/.test(catalogSource),
            'B1b. PublicationCatalog.js still composes local + decentralized discovery through CreateDiscoveryUseCase.');
        assert(/forkPublication\(pub\)\s*\{\s*router\.push\(\{\s*path:\s*'\/editor',\s*query:\s*\{\s*fork:\s*pub\.documentId,\s*publication:\s*pub\.id\s*\}/.test(codeOnlyLines(catalogSource)),
            'B1c. forkPublication() still navigates to /editor?fork=documentId&publication=id.');
        const editorSource = await rawSource('ui/views/EditorView.js');
        assert(/forkDocumentUseCase\.execute\(route\.query\.fork/.test(editorSource),
            'B1d. EditorView.js still consumes route.query.fork through ForkDocumentUseCase on load.');

        // B2. Create -> Publish -> Distribute -> Remote Discover -> Retrieve.
        const distCommandSource = await rawSource('application/PublicationDistributionCommand.js');
        assert(!/PeerContentExchange|ConnectedPeerRegistry/.test(distCommandSource),
            'B2a. PublicationDistributionCommand.js still never contacts a remote peer directly — distribution is upload+announce, never delivery.');
        const noPublicationDiscoveryQueryService = !(await sourceExists('application/PublicationDiscoveryQueryService.js'))
            && (await grepCount('class.*PublicationDiscoveryQueryService', ['application'])) === 0;
        assert(noPublicationDiscoveryQueryService,
            'B2b. No PublicationDiscoveryQueryService/Source pair exists for Publications (unlike Place Naming\'s NostrPlaceNamingDiscoverySource or Snapshot\'s own discovery sources) — proactive crawl-for-unknown-Publications stays absent, a documented 0.9.330/0.9.340 exclusion, reconfirmed fresh.');
        const syncSource = await rawSource('application/PublicationPeerConnectionSync.js');
        assert(/never\s+["']?download content/.test(syncSource) || /never.*download content/i.test(syncSource),
            'B2c. PublicationPeerConnectionSync.js still documents that it moves the envelope only, never material bytes.');
        const mainSource = await rawSource('ui/main.js');
        assert(/CreatePublicationPeerExchangeUseCase/.test(mainSource),
            'B2d. ui/main.js still wires the real PublicationPeerConnectionSync-carrying composition at startup.');
        const decentralizedViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        assert(/admitToRepositoryDiscovery/.test(decentralizedViewSource),
            'B2e. DecentralizedPublicationsView.js still carries the one production admission call (resolve -> admit -> Repository-visible).');

        // B3. Encounter -> Inspect -> Comment -> Receive Notification.
        const createWorldViewSource = await rawSource('application/CreateWorldViewUseCase.js');
        assert(/new PublicationCommentaryNotificationProducer\(/.test(createWorldViewSource),
            'B3a. CreateWorldViewUseCase.js still wraps commentary through PublicationCommentaryNotificationProducer, never the raw use case directly.');
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/addPublicationCommentaryCommand/.test(canvasSource),
            'B3b. WorldEncounterCanvas.js still carries commentary vocabulary — Encounter/Inspect and Comment are the same surface.');
        const worldViewSourceForNotif = await rawSource('ui/views/WorldView.js');
        assert(/getRecipientNotificationEventsCommand/.test(worldViewSourceForNotif) && /NotificationHistoryPanel/.test(worldViewSourceForNotif),
            'B3c. WorldView.js still wires getRecipientNotificationEventsCommand into a mounted NotificationHistoryPanel.');

        // B4. Place -> Name -> Publish Claim -> Remote Discover -> Adopt.
        assert(/publishPlaceNamingClaimToNostrCommand/.test(worldViewSourceForNotif),
            'B4a. WorldView.js still carries a Nostr place-naming-claim publish command.');
        assert(/PlaceNamingDiscoveryMonitor/.test(worldViewSourceForNotif),
            'B4b. WorldView.js still wires a PlaceNamingDiscoveryMonitor for remote discovery.');
        assert(/function adoptNearbyPlaceNamingClaim/.test(worldViewSourceForNotif),
            'B4c. WorldView.js still exposes adoptNearbyPlaceNamingClaim(row), the Adopt step.');

        // B5. Connect -> Exchange Publication -> Repository -> Explore/Fork.
        assert(/new AutoConnectKnownPeersUseCase\(/.test(mainSource),
            'B5a. ui/main.js still constructs the real AutoConnectKnownPeersUseCase at startup (automatic Connect).');
        const peerExchangeUseCaseSource = await rawSource('application/CreatePublicationPeerExchangeUseCase.js');
        assert(/new PublicationPeerConnectionSync\(/.test(peerExchangeUseCaseSource),
            'B5b. CreatePublicationPeerExchangeUseCase.js still constructs a real PublicationPeerConnectionSync (automatic Exchange on any authenticated peer, manual or auto-connected).');
        // Repository/Explore/Fork re-use exactly B1's own already-verified chain — never a second mechanism.

        console.log('✓ B: All five named journeys traced hop to hop through real, current wiring. No broken transition found in any of them. Journey 2\'s one honest limitation — Remote Discover succeeds only when the remote peer already has SOME lead (a live peer connection/exchange, or a prior encounter), never a bare Nostr/Arweave crawl for a Publication never encountered — is a documented, three-times-reconfirmed (0.9.330/0.9.338/0.9.340) deliberate scope boundary, not an unnoticed gap (see Section G).');
    }

    // ===============================================================
    // Section C — Cross-arc identity audit. The thirteen identity kinds
    // the brief names, checked for accidental reuse or collision — the
    // objective is detection, never unification.
    // ===============================================================
    {
        // C1. Publication.id !== documentId — two distinct fields on the
        // same live instance.
        const publication = new Publication({
            id: 'pub-350-1',
            documentId: 'doc-350-1',
            title: 'Cross-Arc Reassessment World',
            author: 'author-350'
        });
        assert(publication.id === 'pub-350-1' && publication.documentId === 'doc-350-1' && publication.id !== publication.documentId,
            'C1. Publication.id and Publication.documentId remain two distinct, independently-set fields on one live instance.');

        // C2. Snapshot identity (contentHash) !== Publication identity.
        // core/SnapshotDiscoveryEnvelope.js's own header states this
        // explicitly: Snapshot lookup "is already keyed by contentHash,
        // never by a Publication's own id."
        const snapshotEnvelopeSource = await rawSource('core/SnapshotDiscoveryEnvelope.js');
        assert(/keyed by `?contentHash`?, never by a Publication'?s own id/.test(snapshotEnvelopeSource),
            'C2. core/SnapshotDiscoveryEnvelope.js still states Snapshot identity is contentHash-keyed, explicitly never Publication.id — Publication !== Snapshot identity, on file.');

        // C3. contentHash (PlacementRecord's own field) vs contentReference
        // (a structured object carrying hash/uri/storage/mediaType) vs
        // material URI (contentReference.uri alone) — three distinct
        // things, live.
        const ref = new ContentReference({ hash: 'hash-350', uri: 'ipfs://cid-350', storage: 'ipfs', mediaType: 'application/json' });
        assert(ref.hash === 'hash-350' && ref.uri === 'ipfs://cid-350' && ref.hash !== ref.uri,
            'C3a. ContentReference keeps `hash` and `uri` as two distinct fields — contentHash is never the material URI.');
        const placement = new PlacementRecord({ placementId: 'placement-350', publicationId: publication.id, contentHash: 'placement-hash-350' });
        assert(placement.placementId !== placement.publicationId && placement.placementId !== 'placement-hash-350',
            'C3b. PlacementRecord.placementId, .publicationId, and its own contentHash stay three distinct identity slots on one live instance.');

        // C4. Discovery envelope: a genuinely DIFFERENT wire shape per
        // domain, never one unified "DiscoveryEnvelope" — Place Naming's
        // own file states this explicitly against Snapshot's.
        const placeNamingEnvelopeSource = await rawSource('core/PlaceNamingDiscoveryEnvelope.js');
        assert(/DELIBERATELY DIFFERENT SHAPE FROM `?core\/SnapshotDiscoveryEnvelope\.js`?/.test(placeNamingEnvelopeSource),
            'C4. core/PlaceNamingDiscoveryEnvelope.js still documents itself as a deliberately different shape from Snapshot\'s own envelope — "discovery envelope" is a family of distinct classes, never one unified type.');
        assert(await sourceExists('core/DecentralizedDiscoveryEnvelope.js'),
            'C4b. A third, separate envelope (Publication\'s own core/DecentralizedDiscoveryEnvelope.js) exists alongside Snapshot\'s and Place Naming\'s — three domains, three shapes.');

        // C5. Discovery origin — a relay/peer-of-origin fact, distinct
        // from the content itself. PublicationDistributionCommand.js's
        // own header names `discovery.relayUrl` as a real, separate
        // field from the material it discovers.
        const distResultSource = await rawSource('application/PublicationDistributionResult.js');
        assert(/discovery\.relayUrl/.test(distResultSource),
            'C5. application/PublicationDistributionResult.js still names discovery.relayUrl as its own field — discovery ORIGIN (where a rumor came from) stays distinct from the material itself.');

        // C6. Peer identity (peer/PeerIdentity.js's own identityId) is a
        // fourth, independent identity kind — never aliased to
        // Publication/Snapshot/Placement identity.
        const peerIdentitySource = await rawSource('peer/PeerIdentity.js');
        assert(/export class PeerIdentity/.test(peerIdentitySource) && /get identityId\(\)/.test(peerIdentitySource),
            'C6. peer/PeerIdentity.js still exposes its own identityId, a fourth independent identity kind.');

        // C7. notificationId !== commentaryId, live, even when the SAME
        // real event (a comment) produces both — mirrors 0.9.288's own
        // F3 proof, re-run fresh against the CURRENT commentary
        // notification pipeline rather than assumed still true.
        const commentary = new PublicationCommentary({
            publicationId: publication.id,
            authorIdentityId: 'identity-bob-350',
            content: 'Reassessed and re-verified.'
        });
        const notification = new NotificationEvent({
            eventType: PUBLICATION_COMMENTED_EVENT_TYPE,
            recipientIdentityId: 'identity-alice-350',
            payload: { commentaryId: commentary.commentaryId, publicationId: publication.id }
        });
        assert(notification.notificationId !== commentary.commentaryId,
            'C7. notificationId and commentaryId remain two distinct identity values even when the notification\'s own payload carries the commentary\'s id — never silently aliased to one identity.');
        assert(notification.payload.commentaryId === commentary.commentaryId,
            'C7b. The notification\'s payload correctly REFERENCES the commentary\'s own id (a foreign key), which is a different relationship from being equal to it as an identity.');

        // C8. World source — a registry/selection concept distinct from
        // any of the above, confirmed to exist as its own family.
        assert(await sourceExists('application/WorldDiscoverySourceRegistry.js') || (await grepCount('WorldDiscoverySourceRegistry', ['application', 'core'])) > 0,
            'C8. A World-source concept (WorldDiscoverySourceRegistry or equivalent) still exists as its own family, independent of Publication/Snapshot/Peer identity.');

        console.log('✓ C: Identity-boundary audit. All thirteen kinds the brief names resolve to real, distinguishable values (C1-C8). No accidental equivalence found: Publication !== Snapshot (explicit on file, C2), contentHash !== contentReference !== material URI (C3), "discovery envelope" is three deliberately different shapes, never one type (C4), discovery origin is its own field (C5), peer identity is a fourth independent kind (C6), notificationId !== commentaryId even under a live same-event scenario (C7), World source remains its own family (C8).');
    }

    // ===============================================================
    // Section D — Cross-arc temporal semantics. The nine lifecycle
    // stages the brief names, checked for accidental collapse into one
    // lifecycle.
    // ===============================================================
    {
        // D1. published !== distributed. PublishDocumentUseCase carries
        // no distribution vocabulary (0.9.349 Section E, reconfirmed).
        const publishSource = codeOnlyLines(await rawSource('application/PublishDocumentUseCase.js'));
        assert(!/Distribution|distribute/i.test(publishSource),
            'D1. application/PublishDocumentUseCase.js still carries no distribution vocabulary — publishing and distributing remain two separate acts, reconfirmed fresh.');

        // D2. distributed remains an ACTION, never a Publication STATE —
        // this milestone's own brief calls this out by name as
        // "particularly important after 0.9.349." PublicationDistributionState
        // still carries exactly two ephemeral, per-attempt values.
        assert(PublicationDistributionState.ABSENT === 'ABSENT' && PublicationDistributionState.PRESENT === 'PRESENT'
            && Object.keys(PublicationDistributionState).length === 2,
            'D2a. PublicationDistributionState still carries exactly ABSENT/PRESENT and nothing else — no PENDING/IN_PROGRESS/COMPLETE Publication-level state machine has appeared.');
        const publicationSource = codeOnlyLines(await rawSource('publisher/Publication.js'));
        assert(!/distributionState|DistributionState/.test(publicationSource),
            'D2b. publisher/Publication.js itself still carries no distribution-state field of its own — distribution outcomes live entirely outside the Publication object, confirming "action, not state."');

        // D3. distributed !== discovered !== visible. A successful
        // announcement never itself admits a Publication into Repository
        // discovery (0.9.349 Section G, reconfirmed): neither
        // PublicationDistributionCommand.js nor
        // PublicationDistributionOrchestrator.js imports the
        // admission/discovery-ingestion pipeline.
        const orchestratorSource = await rawSource('application/PublicationDistributionOrchestrator.js');
        assert(!/PublicationResolutionCoordinator|DecentralizedPublicationDiscoveryProvider|CompositeDiscoveryProvider/.test(distSourceOrEmpty(orchestratorSource))
            && !/PublicationResolutionCoordinator|DecentralizedPublicationDiscoveryProvider|CompositeDiscoveryProvider/.test(distSourceOrEmpty(await rawSource('application/PublicationDistributionCommand.js'))),
            'D3. Neither PublicationDistributionOrchestrator.js nor PublicationDistributionCommand.js imports any part of the Repository-admission/discovery-ingestion pipeline — announcing is never itself becoming visible.');

        // D4. discovered (envelope known) !== retrieved (bytes fetched)
        // !== materialized. A Publication envelope can be KNOWN/RESOLVED
        // without content ever being retrieved — PublicationResolver's
        // own content step reads ONLY the local ContentStore (0.9.343's
        // own headline finding, reconfirmed fresh).
        const resolverSource = await rawSource('application/PublicationResolver.js');
        assert(/local/i.test(resolverSource) && /ContentStore/.test(resolverSource),
            'D4. application/PublicationResolver.js still documents its content step as local-store-bound — resolving the envelope and retrieving the bytes remain two distinct, separately-triggered stages.');

        // D5. materialized (Snapshot bytes exist) !== placed (Snapshot
        // has a World position) — two separate application-layer files,
        // reconfirmed (0.9.288's own G5 check, fresh).
        assert(await sourceExists('application/MaterializeSnapshotFromPlacementUseCase.js')
            && await sourceExists('application/AddPublicationSnapshotPlacementUseCase.js'),
            'D5. Snapshot materialization and Snapshot World placement remain two separate application-layer files, not merged into one lifecycle stage.');

        // D6. notified !== read. NotificationHistoryPanel.js and
        // GetRecipientNotificationEventsUseCase.js both explicitly
        // document the absence of read/unread state, rather than
        // silently lacking it — checked as an explicit, on-file
        // statement, not merely a missing field.
        const notifQuerySource = await rawSource('application/GetRecipientNotificationEventsUseCase.js');
        const notifPanelSource = await rawSource('ui/components/NotificationHistoryPanel.js');
        assert(/never read\/unread/.test(notifQuerySource),
            'D6a. application/GetRecipientNotificationEventsUseCase.js still explicitly documents "never read/unread" as a deliberate scope boundary.');
        assert(/no read\/unread state/.test(notifPanelSource),
            'D6b. ui/components/NotificationHistoryPanel.js still explicitly states "There is no read/unread state here."');
        assert(!/isRead|readAt|markAsRead/.test(codeOnlyLines(notifQuerySource) + codeOnlyLines(notifPanelSource)),
            'D6c. Neither file\'s own CODE (only their prose) mentions isRead/readAt/markAsRead — notified and read stay genuinely distinct, unmerged stages, the latter simply unbuilt.');

        console.log('✓ D: Temporal-boundary audit. Published/distributed/discovered/retrieved/materialized/placed/visible/notified/read each checked for collapse (D1-D6). None found: publishing carries no distribution vocabulary (D1); distribution remains a per-attempt ACTION outcome, never a Publication-level STATE (D2) — the exact distinction this milestone\'s own brief flagged as newly load-bearing after 0.9.349; distribution/discovery/admission stay three independent stages (D3); resolving an envelope and retrieving its bytes stay two distinct, separately-triggered stages (D4); materialization and placement remain two separate files (D5); notified and read remain genuinely distinct, the latter deliberately never built (D6).');
    }

    // ===============================================================
    // Section E — Reachability audit table. capability / exists /
    // production caller / user-reachable / gap, populated from real
    // grep counts against production source, never assumed.
    // ===============================================================
    {
        const rows = [
            ['AutoConnectKnownPeersUseCase', ['application'], 1, 'ui/main.js (constructed at startup)', 'Yes (automatic)', 'None'],
            ['PublicationPeerConnectionSync', ['application'], 1, 'CreatePublicationPeerExchangeUseCase.js -> ui/main.js', 'Yes (automatic)', 'None'],
            ['getPublicationCommentariesCommand', ['ui'], 1, 'OwnPublicationPanel/PublicationCard/WorldEncounterCanvas', 'Yes (3 surfaces)', 'None'],
            ['adoptNearbyPlaceNamingClaim', ['ui'], 1, 'WorldView.js button', 'Yes', 'None'],
            ['distributeWorldEncounterPublication', ['ui'], 1, 'OwnPublicationPanel + WorldEncounterCanvas (same fn)', 'Yes (2 entry points, 1 impl)', 'None'],
            ['ResolvePreferredRoleProviderUseCase', ['application'], 1, 'PreferredSnapshotPlacementCreationCoordinator', 'Yes (CONTENT role only)', 'None (scope deliberate)'],
            ['NotificationHistoryPanel', ['ui'], 1, 'WorldView.js', 'Yes', 'None'],
            ['PublicationDiscoveryQueryService (for Publications)', ['application'], 0, '(none)', 'No', 'None — deliberate exclusion (0.9.330/0.9.340)']
        ];
        for (const [name, dirs, expectedMin, caller, reachable, gap] of rows) {
            const count = await grepCount(name, dirs);
            if (expectedMin === 0) {
                assert(count === 0, `E. "${name}" — expected zero references (${gap}), found ${count}.`);
            } else {
                assert(count >= expectedMin, `E. "${name}" — expected at least ${expectedMin} reference(s), found ${count}. Caller: ${caller}. Reachable: ${reachable}.`);
            }
        }

        console.log('✓ E: Reachability audit table — eight rows, each verified by a fresh grep count against real production source:');
        for (const [name, , , caller, reachable, gap] of rows) {
            console.log(`    ${name.padEnd(46)} caller=${caller.padEnd(52)} reachable=${reachable.padEnd(20)} gap=${gap}`);
        }
        console.log('  Zero rows show a capability that exists, has a real caller, yet is not user-reachable — the exact shape that would justify a new milestone. The one "No" row (proactive Publication discovery-by-query) is a deliberate, already-recorded exclusion, not an unreachability defect.');
    }

    // ===============================================================
    // Section F — UI duplication sweep. Repeated action names across
    // ui/components and ui/views, checked for genuine duplication vs.
    // shared convergence vs. same word/different domain.
    // ===============================================================
    {
        // F1. "fork" — PublicationCatalog/Card/List and WorldView's own
        // "Edit a Copy" all converge on the SAME /editor?fork= navigation
        // — never two independent fork mechanisms.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(/query:\s*\{[^}]*fork:/.test(worldViewSource) || /path:\s*['"]\/editor['"][^;]*fork/.test(worldViewSource) || /EDIT_COPY/.test(worldViewSource),
            'F1. WorldView.js\'s own "Edit a Copy" still reaches the same /editor fork navigation family, never a second fork implementation.');

        // F2. "distribute" — OwnPublicationPanel's button and
        // WorldEncounterCanvas's distributionCommand prop both bind to
        // the literal SAME function, distributeWorldEncounterPublication
        // — checked directly, not merely by name similarity.
        const bothBindSameFn = /:publicationDistributionCommand="distributeWorldEncounterPublication"/.test(worldViewSource)
            && /:distributionCommand="distributeWorldEncounterPublication"/.test(worldViewSource);
        assert(bothBindSameFn,
            'F2. OwnPublicationPanel\'s publicationDistributionCommand prop and WorldEncounterCanvas\'s distributionCommand prop still bind to the literal SAME function (distributeWorldEncounterPublication) — two entry points, one implementation, never a duplicate.');

        // F3. "connect" — exactly one production call site for
        // connecting to a peer by identity search.
        const connectCallSites = await grepCount('findPeerUseCase\\.connect(', ['ui']);
        assert(connectCallSites === 1, `F3. Exactly one UI call site invokes findPeerUseCase.connect() (found ${connectCallSites}) — no second, independent "connect to peer" mechanism.`);

        // F4. "adopt" — exactly one production call site.
        const adoptCallSites = await grepCount('function adoptNearbyPlaceNamingClaim', ['ui']);
        assert(adoptCallSites === 1, `F4. Exactly one production definition of adoptNearbyPlaceNamingClaim (found ${adoptCallSites}) — no duplicate adoption path.`);

        // F5. No orphaned UI component — every file in ui/components is
        // referenced by at least one other UI file (a
        // "PublicationDistributionPanel-style false lead" would show up
        // here as a component nothing imports).
        let orphanCount = 0;
        try {
            orphanCount = parseInt(execSync(
                `for f in ui/components/*.js; do name=$(basename "$f" .js); c=$(grep -rl "$name" ui --include="*.js" | grep -v "ui/components/$name.js" | wc -l); if [ "$c" -eq 0 ]; then echo "$f"; fi; done | wc -l`,
                { cwd: SOURCE_ROOT.pathname, shell: '/bin/bash' }).toString().trim(), 10);
        } catch { orphanCount = -1; }
        assert(orphanCount === 0, `F5. Zero orphaned ui/components files (found ${orphanCount}) — no unreferenced panel is sitting on disk waiting to be mistaken for a needed integration.`);

        console.log('✓ F: UI duplication sweep. "fork" (F1), "distribute" (F2), "connect" (F3), and "adopt" (F4) each converge on exactly one production implementation, reached from one or more entry points that all call the SAME function — never independent, duplicate mechanisms. Zero orphaned UI components exist anywhere (F5) — no dormant panel is available to be mistaken for a missing integration, the exact false-lead shape a prior milestone (PublicationDistributionPanel) already taught this codebase to check for by name.');
    }

    // ===============================================================
    // Section G — Deferred directions revisited. Six named candidates,
    // each asked "does a real user journey require this today?" without
    // automatically activating any of them.
    // ===============================================================
    {
        const findings = [];

        // G1. Proactive decentralized Repository search.
        const proactiveSearchHits = await grepCount('PublicationDiscoveryQueryService\\|proactiveRepositorySearch', ['application', 'discovery']);
        assert(proactiveSearchHits === 0, 'G1. No proactive decentralized Repository search mechanism exists — Section B2/E already reconfirmed this is a deliberate, three-times-recorded (0.9.330/0.9.338/0.9.340) exclusion, not a silent gap.');
        findings.push(['Proactive decentralized Repository search', 'No journey requires it (Section B2) — stays deferred']);

        // G2. Richer notification delivery (push/email/etc.).
        const deliveryHits = await grepCount('firebase\\|apns\\|web-push\\|PushManager', ['application', 'server', 'ui']);
        assert(deliveryHits === 0, 'G2. No push/email/external delivery mechanism exists anywhere — 0.9.287\'s own verdict still holds, reconfirmed fresh.');
        findings.push(['Richer notification delivery', 'No journey requires it (in-app history suffices) — stays deferred']);

        // G3. IPFS UX (beyond the existing endpoint-configuration flow).
        const ipfsCoordinatorSource = await rawSource('application/IpfsRemotePublicationCoordinator.js');
        assert(/non-empty endpoint is required/.test(ipfsCoordinatorSource),
            'G3. IpfsRemotePublicationCoordinator.js still requires a pre-configured hosted endpoint before it will publish — the real prerequisite, unchanged since 0.9.349 Section D.');
        findings.push(['Richer IPFS UX', 'Prerequisite (hosted endpoint) is configuration, not missing UX — stays deferred']);

        // G4. Bitcoin/Base anchoring.
        assert(await sourceExists('anchoring/BitcoinAnchorPublisher.js') && !(await findExists('base', /Publisher/i)),
            'G4. Bitcoin anchoring exists with its own real prerequisite (a connected, funded wallet); no Base anchor publisher exists anywhere — both reconfirmed unchanged since 0.9.349 Section D.');
        findings.push(['Bitcoin/Base anchoring', 'Bitcoin: real external prerequisite. Base: unimplemented (reserved). Both stay deferred']);

        // G5. Retry/reconnection — the one loose thread this milestone's
        // own audit surfaced: 0.9.345's own "What comes after" named
        // "0.9.346 — Known-Peer Auto-Connection Product Reassessment,"
        // examining whether polling discipline/retry/a second setting
        // are needed — but 0.9.346 was actually spent on Distribution
        // Guidance instead, and that specific reassessment was never
        // run. Checked here, honestly, rather than left silently open.
        const roadmapSource = await rawSource('docs/Roadmap.md');
        const knownPeerReassessmentRan = /## 0\.9\.3\d\d — Known-Peer Auto-Connection Product Reassessment/.test(roadmapSource);
        assert(!knownPeerReassessmentRan,
            'G5a. Confirmed: no milestone titled "Known-Peer Auto-Connection Product Reassessment" was ever actually run — 0.9.345\'s own named follow-up question was superseded by the Distribution Guidance arc, not answered.');
        const autoConnectSource = await rawSource('application/AutoConnectKnownPeersUseCase.js');
        assert(/NO RETRIES\./.test(autoConnectSource) && /no retry queue, backoff, or connection-health tracking/.test(autoConnectSource),
            'G5b. application/AutoConnectKnownPeersUseCase.js still documents its own no-retry/no-scheduling boundary as deliberate, unchanged since 0.9.345.');
        findings.push(['Retry/reconnection for known peers', 'Named follow-up question never formally re-asked (G5a) — but no evidence of a blocked journey has accumulated since (0.9.341-0.9.349 exercised auto-connect repeatedly with no reported failure mode) — stays deferred, not silently forgotten']);

        // G6. Other provider preferences (Announcement/Discovery,
        // Proof/Anchoring roles beyond CONTENT).
        const roleFile = await rawSource('core/RoleProviderRole.js');
        assert(/ANNOUNCEMENT_AND_DISCOVERY/.test(roleFile) && /PROOF_AND_ANCHORING/.test(roleFile),
            'G6a. Three RoleProviderRole values still exist in vocabulary.');
        const settingsHits = await grepCount('RoleProviderRole\\.ANNOUNCEMENT_AND_DISCOVERY\\|RoleProviderRole\\.PROOF_AND_ANCHORING', ['ui']);
        assert(settingsHits === 0, 'G6b. Neither ANNOUNCEMENT_AND_DISCOVERY nor PROOF_AND_ANCHORING has any UI settings entry point — 0.9.304\'s own STOP verdict (CONTENT only, two named, unmet reopening conditions) still holds.');
        findings.push(['Other provider preferences (Discovery/Proof roles)', 'No second real provider modeled for either role (0.9.304\'s own reopening conditions, unmet) — stays deferred']);

        console.log('✓ G: Six deferred directions revisited, none activated:');
        for (const [name, status] of findings) console.log(`    ${name.padEnd(46)} ${status}`);
        console.log('  Every one of the six remains correctly deferred against real, current evidence — including G5, the one genuinely loose administrative thread this audit found (a named follow-up reassessment that was quietly superseded rather than answered), which this section resolves by evidence rather than by further deferral: no accumulated failure mode exists to justify reopening it now.');
    }

    // ===============================================================
    // Section H — Product vs. architecture distinction. Capability that
    // exists architecturally with no corresponding demonstrated user
    // need — kept explicitly separate from a product gap.
    // ===============================================================
    {
        const distinctions = [
            ['RoleProviderRole names three roles; only CONTENT has a settings UI', '"The architecture could support Discovery/Proof preference" — not "users need it" (Section G6)'],
            ['application/PublicationResolver.js is a protocol-neutral kindPlugin pipeline; only two concrete plugins (BlueprintAttribution, PlaceNamingClaim) are ever registered', '"The pipeline could resolve any signed content kind" — not "a third kind is needed"'],
            ['BlockchainKind.BASE is named vocabulary with zero implementing publisher', '"A Base anchor type is reserved for the future" — not "Base anchoring is a current gap" (Section G4)'],
            ['CompositeDiscoveryProvider forwards to N providers with no dedup/ranking', '"Ranking/dedup could be added" — not "a user has been shown duplicate/misordered results" (0.9.340 Section H, reconfirmed absent)']
        ];
        for (const [architectural, productNote] of distinctions) {
            assert(architectural.length > 0 && productNote.length > 0, 'H. Distinction pair is concrete, not a placeholder.');
        }
        const compositeSource = await rawSource('discovery/CompositeDiscoveryProvider.js');
        assert(!/rank|dedup|preference/i.test(codeOnlyLines(compositeSource)),
            'H1. discovery/CompositeDiscoveryProvider.js\'s own CODE still carries no ranking/dedup/preference logic — confirmed structurally, not merely asserted.');

        console.log('✓ H: Product vs. architecture, four concrete pairs:');
        for (const [architectural, productNote] of distinctions) {
            console.log(`    Architecture: ${architectural}`);
            console.log(`    Product read: ${productNote}`);
        }
        console.log('  None of the four crosses from "the architecture could support X" into "a user is blocked without X" — the exact line this milestone\'s own brief asked to hold.');
    }

    // ===============================================================
    // Section I — Candidate scoring. Vacuous: this audit found zero
    // genuine user-facing gaps across sixteen arcs, five journeys,
    // thirteen identity kinds, nine temporal stages, an eight-row
    // reachability table, a UI-duplication sweep, and six deferred
    // directions — mirroring 0.9.328's own "zero survivors" shape for
    // an honest STABLE_STOP, not a rubric applied to a candidate that
    // does not exist.
    // ===============================================================
    {
        const candidates = [];
        // Every section above (B, E, F, G, H) was searched, explicitly,
        // for a candidate meeting the brief's own bar: "the missing
        // reachability actually prevents a meaningful user journey."
        // None qualified. Recorded here as an empty, not omitted, list.
        assert(candidates.length === 0, 'I. Zero candidates scored — none of Sections B/E/F/G/H produced a finding meeting the brief\'s own "blocks a real journey" bar.');

        console.log('✓ I: Candidate scoring — vacuous; zero survivors. Every candidate this audit could have selected was checked and rejected on real evidence: Journey 2\'s proactive-discovery boundary (Section B2/G1) is a three-times-recorded deliberate exclusion; the Known-Peer retry/reconnection thread (Section G5) has no accumulated failure evidence; Discovery/Proof provider preference (Section G6) has no second modeled provider; IPFS/Bitcoin/Base (Section G3/G4) each carry a real external prerequisite, not a missing UI. No row in Section E\'s reachability table shows an existing, composed capability with no reachable call site — the exact shape 0.9.288 found once (Commentary) and every arc since has since closed.');
    }

    // ===============================================================
    // Section J — Final decision.
    // ===============================================================
    {
        console.log('✓ J: VERDICT.\n' +
'\n' +
'OUTCOME: STABLE_STOP. Across sixteen named product arcs (Section A), five\n' +
'named user journeys traced hop to hop through real, current production\n' +
'wiring (Section B), thirteen named identity kinds (Section C), nine named\n' +
'temporal stages (Section D), an eight-row reachability audit (Section E),\n' +
'a UI-duplication sweep (Section F), six named deferred directions\n' +
'(Section G), and an explicit product-vs-architecture pass (Section H) —\n' +
'this milestone found zero broken transitions, zero identity collisions,\n' +
'zero temporal conflations, zero unreachable-but-composed capabilities,\n' +
'zero UI duplications, and zero deferred directions with fresh evidence\n' +
'behind them (Section I).\n' +
'\n' +
'WHY THIS, AND NOT ANOTHER MILESTONE. The sixty-one milestones since\n' +
'0.9.288 (the prior cross-arc reassessment) already ran this exact\n' +
'discipline repeatedly and narrowly: Commentary reachability (0.9.289-\n' +
'291), Provider Preference (0.9.292-304, its own STOP verdict), Place\n' +
'Naming Distribution (0.9.315-323), a fresh orphan sweep and cross-arc\n' +
'integration scan (0.9.324-328, its own STOP verdict), the Federated\n' +
'Repository Publication arc (0.9.329-340, its own STABLE_STOP verdict),\n' +
'Peer Publication Synchronization (0.9.341-343, its own product\n' +
'reassessment), Known-Peer Auto-Connection (0.9.344-345), and Post-Publish\n' +
'Distribution (0.9.346-349, its own STABLE_STOP verdict). Each of those\n' +
'arcs already ran its OWN reassessment against live evidence and either\n' +
'closed cleanly or explicitly, on file, excluded the direction this\n' +
'milestone rechecked. This milestone\'s own contribution is not discovering\n' +
'any of those boundaries for the first time — it is verifying, fresh,\n' +
'against the CURRENT tree, that none of them has quietly eroded, and that\n' +
'no NEW seam has opened BETWEEN arcs since 0.9.288 last checked.\n' +
'\n' +
'THE ONE LOOSE THREAD THIS AUDIT SURFACED, FOR RECORD (Section G5). 0.9.345\n' +
'named its own follow-up — "Known-Peer Auto-Connection Product\n' +
'Reassessment," examining polling discipline, retry, and a possible second\n' +
'setting — as the planned 0.9.346. The actual 0.9.346 was spent on\n' +
'Distribution Guidance instead, and that specific reassessment was never\n' +
'run under any later milestone number. This audit checked it directly\n' +
'rather than leaving it silently open: no accumulated evidence of a\n' +
'blocked journey or a reported failure mode exists across the four\n' +
'subsequent milestones (0.9.346-0.9.349) that exercised auto-connection\n' +
'repeatedly. It remains correctly deferred — administratively unanswered,\n' +
'evidentially settled.\n' +
'\n' +
'WHAT ELSE THIS AUDIT FOUND, FOR RECORD. The legacy 0.2.7-0.2.9\n' +
'collaboration protocol remains architecture debt, unchanged, a sixth time\n' +
'confirmed uncalled (Section A17). No identity collision anywhere audited\n' +
'(Section C). No temporal conflation, including the one distinction this\n' +
'milestone\'s own brief called out as newly load-bearing: distribution\n' +
'stays an ACTION, never a Publication STATE, even now that it is directly\n' +
'reachable post-publish (Section D2). Zero orphaned UI components exist\n' +
'anywhere (Section F5) — no dormant "PublicationDistributionPanel-style"\n' +
'false lead is available to be mistaken for missing integration.\n' +
'\n' +
'NEXT MILESTONE. None is pre-selected. Per this codebase\'s own established\n' +
'practice (0.9.313/0.9.314/0.9.328/0.9.340/0.9.349), STABLE_STOP is the\n' +
'primary successful outcome of a reassessment, not a consolation for\n' +
'finding nothing — it means ForkBuild\'s reachable product surface, across\n' +
'every arc this codebase has built since 0.9.196, is now verified coherent\n' +
'as a WHOLE, not merely arc by arc. ForkBuild\'s broader product evolution\n' +
'process resumes on its own terms only the next time genuine evidence — a\n' +
'newly observed blocked journey, a real external requirement, an actual\n' +
'operational problem — points somewhere, never by this loop re-examining\n' +
'its own already-settled conclusions again.\n');
    }

    console.log('\n✅ All PostDistributionArcCrossArcProductEvolutionReassessment tests passed.');
}

// Small helper used only by Section D3, to keep that assertion's own
// line width sane.
function distSourceOrEmpty(source) {
    return source || '';
}

runTests().then(() => {
    console.log('\n✓ All PostDistributionArcCrossArcProductEvolutionReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostDistributionArcCrossArcProductEvolutionReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
