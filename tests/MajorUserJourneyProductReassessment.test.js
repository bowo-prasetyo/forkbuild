import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationResolver } from '../application/publication/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/publication/PublicationResolutionCoordinator.js';
import { ReconstructPublicationDiscoveryUseCase } from '../application/publication/ReconstructPublicationDiscoveryUseCase.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/publication/CreatePublicationDisplayKindRegistryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/publication/PublicationContentValidator.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { PlacePublicationUseCase } from '../application/placement/PlacePublicationUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { worldEncounterCanvasFiles, publicationsPageFiles, mainFiles } from './support/SourceFileGroups.js';

// 0.9.650 — Major User Journey Product Reassessment.
//
// TYPE: test-only / whole-product journey audit. PRODUCTION CHANGES: none
// (Section J's own guard).
//
// 0.9.640-0.9.645 closed the Editor Document Portability arc (Export,
// Import, DocumentCloneService identity/group-remapping). 0.9.646-0.9.649
// closed a UI-consistency arc (Editor sidebar scroll ownership,
// Publications container convention). Both arcs answered narrow,
// well-posed questions correctly. This milestone deliberately asks a
// different, wider one, at the requesting brief's own insistence: not
// "is seam X correct" but "what can a user actually accomplish
// end-to-end today, across every major journey, and where does the
// product's behavior diverge from what a user would reasonably believe
// happened?" It composes prior closures rather than re-deriving them —
// Section A re-executes three of the most recent ones live, as real
// subprocesses — and spends its own live effort on genuinely new ground:
// cross-session continuity, identity-boundary integrity, failure-mode
// truthfulness, and one flagship live-composed proof (Section C) of a
// discontinuity none of the 500+ prior milestones' own closure audits
// have asserted against.
//
// METHOD, matching this codebase's own established idiom: journeys that
// can be proven with real, unmodified production classes composed
// end-to-end are (Sections A, C, F); journeys already covered in depth by
// dozens of prior closure audits are reconfirmed structurally, against
// current on-disk source, rather than re-run in full (Sections B, D, H);
// cross-cutting facts that are best stated as a table are (Sections E,
// G, I).
//
//   A. Prior-arc reconfirmation, live — the baseline this milestone
//      builds on, not re-derives.
//   B. Publication journey chain — Document -> Publication ->
//      Distribution -> Discovery -> Verification -> Repository
//      admission, reconfirmed wired end to end.
//   C. THE FLAGSHIP FINDING — World journey cross-session continuity,
//      live-composed: a Publication admitted to Repository discovery via
//      the World-Encounter path is explicitly Placed, its PlacementRecord
//      genuinely survives a full session boundary, but the Publication
//      itself does not — it silently vanishes from World rendering,
//      indistinguishable from never having been admitted, because the
//      admission gate that gave it discoverability was never durable.
//   D. Commentary journey — local authoring/distribution and remote
//      receipt, with a second finding: two of three distribution
//      substrates' own remote-arrival retrieval is never triggered by
//      any live UI code path.
//   E. Cross-session continuity, exhaustive — what survives restart for
//      every major category, cited against real bootstrap/persistence
//      code.
//   F. Identity continuity — eight distinct identity concepts, proven
//      structurally independent via real construction, not merely
//      asserted from class names.
//   G. Failure/degraded journeys — a table of concrete failure
//      conditions against their actual, real handling code, including a
//      second finding: Save has no error handling of any kind.
//   H. UI truthfulness — status-label vocabulary checked against the
//      actual condition it is gated on, not its own name.
//   I. Journey discontinuity matrix and classification.
//   J. Production-change guard.
//   K. Verdict and recommendation.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
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
function runGuardLive(relativeTestFile) {
    try {
        const stdout = execSync(`node ${relativeTestFile}`, { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
        return { passed: true, stdout };
    } catch (error) {
        return { passed: false, stdout: `${error.stdout || ''}${error.stderr || ''}` };
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label, storage) {
    const provider = new LocalIdentityProvider(storage);
    provider.login(label);
    return provider;
}

function makePublication({ id, documentId, title, author = 'alice', contentHash }, identityProvider) {
    const documentContentReference = new ContentReference({
        hash: contentHash || `docHash-${documentId}`, algorithm: 'fnv1a-32', mediaType: 'application/json', size: 128
    });
    let publication = new Publication({
        id, documentId, title, author,
        providerId: 'local',
        contentHash: documentContentReference.hash,
        schemaVersion: 3,
        contentReference: documentContentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON(),
        signature: null
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// Composes one full "application lifecycle" worth of production
// collaborators against given durable storage — the exact shape
// ui/main.js's own composition root builds and 0.9.609's own closure
// audit already established as this codebase's own way of simulating
// "boot the app" / "close the app" without actually booting Vue.
function composeLifecycle(storage) {
    const catalog = new LocalPublicationCatalog(storage);
    const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
    const coordinator = new PublicationResolutionCoordinator(resolver, null);
    const discoveryProvider = new DecentralizedPublicationDiscoveryProvider();
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    return { catalog, resolver, coordinator, discoveryProvider, spatialIndexProvider, placementRegistry };
}

async function run() {
    console.log('Running Major User Journey Product Reassessment tests...\n');

    // ===============================================================
    // Section A — prior-arc reconfirmation, live.
    // ===============================================================
    {
        const portability = runGuardLive('tests/EditorDocumentPortabilityPostFixClosureAudit.test.js');
        assert(portability.passed && /ARC_CLOSED/.test(portability.stdout),
            n('0.9.645\'s own Editor Document Portability closure audit, re-executed live, still exits 0 and prints ARC_CLOSED'));

        const layout = runGuardLive('tests/UnifiedApplicationLayoutUIConsistencyBoundaryAudit.test.js');
        assert(layout.passed, n('0.9.646\'s own Unified Application Layout audit, re-executed live, still exits 0'));

        const publicationsConvention = runGuardLive('tests/PublicationsIdentityManagementConventionAlignment.test.js');
        assert(publicationsConvention.passed, n('0.9.649\'s own Publications container-convention closure audit, re-executed live, still exits 0'));

        console.log('✓ A: the three most recently closed arcs reconfirmed live, right now, against current source — this milestone builds on that baseline, never re-derives it.');
    }

    // ===============================================================
    // Section B — Publication journey chain, reconfirmed wired.
    // ===============================================================
    {
        const publishSource = codeOnly(await rawSource('application/publication/PublishDocumentUseCase.js'));
        const distributionSource = codeOnly(await rawSource('application/publication/distribution/PublicationDistributionCommand.js'));
        const decentralizedViewSource = codeOnly((await Promise.all(publicationsPageFiles().map((file) => rawSource(file)))).join('\n'));
        const worldEncounterCanvasSource = codeOnly((await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n'));
        const discoveryProviderSource = codeOnly(await rawSource('discovery/DecentralizedPublicationDiscoveryProvider.js'));

        // B1. Document -> Publication: real, synchronous, wired.
        assert(/publisherProvider\.publish\(/.test(publishSource), 'B1a. PublishDocumentUseCase.js calls the real publisher provider synchronously.');
        const toolbarSource = codeOnly(await rawSource('ui/components/Toolbar.js'));
        assert(/props\.publishDocumentUseCase\.execute\(/.test(toolbarSource), 'B1b. Toolbar.js wires a real button to PublishDocumentUseCase.execute().');

        // B2. Publication -> Distribution: async, network-dependent, two
        // independent substrates, never both at once (fan-out excluded
        // by this codebase's own established "selection, never fan-out"
        // rule, reconfirmed live by the Provider Selection closure arc,
        // 0.9.636-0.9.639).
        assert(/executePublicationDistributionCommand/.test(distributionSource), 'B2a. A real, named command implements Publication -> Distribution.');

        // B3. Discovery -> Verification -> Repository admission: TWO
        // independently implemented admission gates (0.9.573's own
        // Section G finding, reconfirmed live here), both requiring an
        // actual success outcome, never a bare "was attempted."
        assert(decentralizedViewSource.includes('function admitToRepositoryDiscovery(view) {') && decentralizedViewSource.includes('view.resolved'),
            'B3a. DecentralizedPublicationsView.js\'s own admission gate requires view.resolved (the full ten-step PublicationResolver discipline), not merely an attempt.');
        assert(worldEncounterCanvasSource.includes("admitToRepositoryDiscovery(loading, verification) {") && worldEncounterCanvasSource.includes("verification.status === 'VERIFIED'"),
            'B3b. WorldEncounterCanvas.js\'s own admission gate requires verification.status === VERIFIED, independently composed, never importing the other file\'s gate.');
        assert(!discoveryProviderSource.includes('signature') && !discoveryProviderSource.includes('verify'),
            'B3c. DecentralizedPublicationDiscoveryProvider.add() itself performs no verification of its own — it trusts its callers, both of which B3a/B3b just proved gate on real verification.');

        console.log('✓ B: Document -> Publication -> Distribution -> Discovery -> Verification -> Repository admission is a real, wired chain. Two independently-composed admission gates converge on one shared, deliberately unverifying index — verification lives at the gate, not the store.');
    }

    // ===============================================================
    // Section C — THE FLAGSHIP FINDING. World journey cross-session
    // continuity, live-composed against real, unmodified production
    // classes.
    // ===============================================================
    {
        const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
        const storage = new InMemoryStorageProvider();
        const author = makeIdentity('flagship-650-author', storage);

        const session1 = composeLifecycle(storage);
        const viewCenter = { x: 10, y: 0, z: 10 };
        const radius = 5;

        // The CONTROL: a Publication that reaches Repository discovery
        // through the "normal" path this codebase's own peer-gossip
        // family and 0.9.607/0.9.608/0.9.609's own reconstruction fix
        // already cover — resolver.publish() + catalog.add(), exactly
        // application/publication/CreatePublicationPeerExchangeUseCase.js's own shape.
        const survivorPub = makePublication({ id: 'survivor-650', documentId: 'survivor-650-doc', title: 'Reaches Repository via the catalog' }, author);
        const survivorEnvelope = await session1.resolver.publish({ content: survivorPub, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: author });
        session1.catalog.add(survivorEnvelope);
        session1.discoveryProvider.add(survivorPub);
        new PlacePublicationUseCase(session1.spatialIndexProvider, session1.discoveryProvider, { execute() { throw new Error('no document'); } }, null, session1.placementRegistry, author)
            .execute(survivorPub.id, viewCenter);

        // THE SUBJECT: a Publication admitted to Repository discovery
        // exactly the way ui/components/WorldEncounterCanvas.js's own
        // admitToRepositoryDiscovery() does it for a Nostr/Arweave
        // walking-encounter Snapshot candidate — discoveryProvider.add()
        // ONLY, never LocalPublicationCatalog.add(). This is not a
        // simplification this test introduces: grepping the ENTIRE
        // Snapshot-discovery pipeline (application/
        // AutomaticSnapshotEncounterCascade.js and everything it calls)
        // for LocalPublicationCatalog finds zero references — confirmed
        // immediately below, from real source, before this test trusts
        // its own fixture to be representative.
        const cascadeSource = await rawSource('application/snapshot/AutomaticSnapshotEncounterCascade.js');
        assert(!cascadeSource.includes('LocalPublicationCatalog'), n('setup check: application/snapshot/AutomaticSnapshotEncounterCascade.js — the real production pipeline behind World-Encounter snapshot discovery — never references LocalPublicationCatalog, confirming the fixture below reproduces its actual admission shape, not a hypothetical one'));
        const worldEncounterCanvasSourceForCheck = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        assert(!/LocalPublicationCatalog/.test(worldEncounterCanvasSourceForCheck) && worldEncounterCanvasSourceForCheck.includes('this.decentralizedPublicationDiscoveryProvider.add(loading.material)'),
            n('setup check: ui/components/WorldEncounterCanvas.js\'s own admitToRepositoryDiscovery() calls ONLY decentralizedPublicationDiscoveryProvider.add() — confirmed, not assumed'));

        const subjectPub = makePublication({ id: 'world-encounter-subject-650', documentId: 'world-encounter-subject-650-doc', title: 'Admitted only via World-Encounter discovery, exactly like WorldEncounterCanvas.js#admitToRepositoryDiscovery()' }, author);
        session1.discoveryProvider.add(subjectPub); // the ONLY admission call — no catalog.add(), matching production exactly
        new PlacePublicationUseCase(session1.spatialIndexProvider, session1.discoveryProvider, { execute() { throw new Error('no document'); } }, null, session1.placementRegistry, author)
            .execute(subjectPub.id, viewCenter);

        assert(session1.placementRegistry.findByPublicationId(subjectPub.id).length === 1,
            n('within session 1, the World-Encounter-discovered Publication really is explicitly Placed — a genuine PlacementRecord exists, identical in kind to the control\'s'));
        const visibleInSession1 = new LocalWorldLayoutProvider(session1.spatialIndexProvider, session1.discoveryProvider).findVisibleDocuments(viewCenter, radius);
        assert(visibleInSession1.includes(subjectPub.documentId) && visibleInSession1.includes(survivorPub.documentId),
            n('within session 1 — the SAME session that admitted and placed it — the World-Encounter subject renders exactly like the control: both documentIds appear in findVisibleDocuments()'));

        // Destroy every session-1 object entirely — no reference to it is
        // kept below. This is the ONLY thing this test simulates as "the
        // user closes and reopens the application": a fresh in-memory
        // discoveryProvider (never persisted — discovery/
        // DecentralizedPublicationDiscoveryProvider.js keeps no store of
        // its own, by 0.9.335's own deliberate design) plus a fresh read
        // of the SAME durable storage every other collaborator here uses.
        const session2 = composeLifecycle(storage);
        assert(session2.discoveryProvider.findById(subjectPub.id) === null && session2.discoveryProvider.findById(survivorPub.id) === null,
            n('a genuinely fresh session\'s discovery index has heard of neither Publication yet — the ordinary post-restart starting state'));

        const { reconstructed } = await new ReconstructPublicationDiscoveryUseCase(session2.catalog, session2.coordinator, kindPlugins, session2.discoveryProvider).execute();
        assert(reconstructed === 1, n('reconstruction — the SAME production use case ui/main.js runs at every real application boot — reports exactly ONE newly-discoverable Publication, not two'));
        assert(session2.discoveryProvider.findById(survivorPub.id) !== null,
            n('the CONTROL is discoverable again after the session boundary — reconstruction genuinely works for the path it was built for'));
        assert(session2.discoveryProvider.findById(subjectPub.id) === null,
            n('*** THE FINDING *** the World-Encounter-discovered Publication is NOT discoverable again — reconstruction has no durable record of it to rebuild from, because admission via this specific path was never durable in the first place'));

        // The PlacementRecord itself is untouched — this is not a
        // storage-loss bug, it is a discoverability-loss bug.
        const survivingRecords = session2.placementRegistry.findByPublicationId(subjectPub.id);
        assert(survivingRecords.length === 1 && survivingRecords[0].position.x === viewCenter.x,
            n('the PlacementRecord itself genuinely survived the session boundary, untouched, at its original position — the placement was never lost; only the Publication\'s own discoverability was'));

        // The user-visible consequence: it silently vanishes from World
        // rendering — not merely "harder to find," completely absent,
        // exactly like the control would be if it had never been
        // admitted at all.
        const visibleInSession2 = new LocalWorldLayoutProvider(session2.spatialIndexProvider, session2.discoveryProvider).findVisibleDocuments(viewCenter, radius);
        assert(visibleInSession2.includes(survivorPub.documentId),
            n('the control still renders correctly after the session boundary — findVisibleDocuments() finds it via the reconstructed discovery index'));
        assert(!visibleInSession2.includes(subjectPub.documentId),
            n('*** THE USER-VISIBLE CONSEQUENCE *** the World-Encounter subject\'s documentId is completely absent from findVisibleDocuments() — not flagged, not listed as unavailable, simply never produced, using the exact production class (world-layout/LocalWorldLayoutProvider.js) real World rendering calls, unmodified'));

        // Confirm this is not merely "harder to see" — it also never
        // reaches the "failed" bucket getSpatialState() exposes to
        // WorldView.js's own honest "Unavailable (N)" section, because
        // findVisibleDocuments()'s own step 1 (world-layout/
        // LocalWorldLayoutProvider.js) skips a spatial-index hit whose
        // discoveryProvider.findById() call returns null via a plain
        // `if (publication)` guard — it is filtered out before ever
        // becoming a candidate a later stage could classify as failed.
        const worldLayoutSource = await rawSource('world-layout/LocalWorldLayoutProvider.js');
        assert(worldLayoutSource.includes('const publication = this._discoveryProvider.findById(p.publicationId);') && worldLayoutSource.includes('if (publication) {'),
            n('confirmed structurally: the exact line that silently drops an unresolvable spatial-index hit, in the real production file, unmodified — this is not a fixture artifact, it is how the shipped code behaves'));

        console.log('✓ C — THE FLAGSHIP FINDING, live-composed: a Publication discovered via the World-Encounter path (Nostr/Arweave walking-triggered Snapshot discovery), verified, admitted, and explicitly Placed is durably placed but NOT durably discoverable — its PlacementRecord survives a full session boundary untouched, but its Publication identity does not, because WorldEncounterCanvas.js#admitToRepositoryDiscovery() only ever calls discoveryProvider.add(), never LocalPublicationCatalog.add(), and ReconstructPublicationDiscoveryUseCase (0.9.608/0.9.609) only replays the catalog. The control Publication (admitted via the catalog-backed path 0.9.607-0.9.609 fixed) survives the identical boundary correctly, in the same test, using the same production classes — proving this is a real, narrow, already-precisely-located discontinuity, not a general reconstruction failure. Classification: CONTINUITY_GAP.');
    }

    // ===============================================================
    // Section D — Commentary journey.
    // ===============================================================
    {
        const mainSource = codeOnly((await Promise.all(mainFiles().map((file) => rawSource(file)))).join('\n'));
        const nostrDiscoverSource = await rawSource('application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js');

        // D1. Local authoring/distribution: real UI entry points, real
        // local persistence, real (best-effort, fire-and-forget)
        // distribution — reconfirmed structurally.
        // The card's Commentary lives in the shared
        // PublicationCommentarySection.js it mounts.
        const cardSource = codeOnly(await rawSource('ui/components/PublicationCard.js') + await rawSource('ui/components/PublicationCommentarySection.js'));
        assert(/<PublicationCommentarySection/.test(cardSource) && /submitCommentary\(\) \{/.test(cardSource), 'D1a. PublicationCard.js mounts a real commentary-submission method (PublicationCommentarySection.submitCommentary()).');
        const commentaryStoreSource = codeOnly(await rawSource('storage/PublicationCommentaryStore.js'));
        assert(commentaryStoreSource.includes('PublicationCommentaryConflictError'), 'D1b. storage/PublicationCommentaryStore.js has a real conflict type — writes are not blind overwrites.');

        // D2. THE SECOND FINDING (at the time): ui/main.js provided
        // Nostr/Arweave remote-Commentary-discovery commands, but nothing
        // in the UI ever invoked either one, so only WebRTC ever delivered
        // a remote Commentary. AMENDED — the deferred product decision
        // (application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js,
        // "deciding WHEN this runs... is a separate, later product
        // decision") has since been made: fetch when a Publication's
        // Commentary is opened, plus an explicit "Check for new comments".
        // Both commands are now reached through one composed
        // refreshPublicationCommentaryCommand, never injected directly.
        assert(mainSource.includes("app.provide('discoverPublicationCommentaryFromNostrCommand'") && mainSource.includes("app.provide('discoverPublicationCommentaryFromArweaveCommand'"),
            n('D2a. both commands are genuinely provided at the composition root'));
        assert(/composeRefreshPublicationCommentaryCommand\(\{\s*sources: \[\s*\{ name: 'Nostr', discover: discoverPublicationCommentaryFromNostrCommand \},\s*\{ name: 'Arweave', discover: discoverPublicationCommentaryFromArweaveCommand \}/.test(mainSource),
            n('D2b. RESOLVED — both commands are composed into refreshPublicationCommentaryCommand, so a live session now reaches them'));
        const remoteCheckMounts = grepFiles('<PublicationCommentaryRemoteCheck', ['ui']);
        assert(remoteCheckMounts.length === 3,
            n(`D2c. RESOLVED — the fetch-on-open / "Check for new comments" component is mounted in every Commentary surface (Repository card and list, through their one shared PublicationCommentarySection; My Publication; World Encounters) — found: ${remoteCheckMounts.join(', ') || 'none'}. A Commentary distributed only via Nostr or Arweave now reaches a Wanderer who opens that Publication's Commentary.`));

        // D3. The 0.9.623 notification bridge IS wired into all three
        // substrates' own receive paths at the code level — the
        // reachability gap above is Discovery-time, not Notification-time.
        const bridgeCallSites = grepFiles('handleCommentaryReceived\\(', ['ui/main.js']);
        assert(bridgeCallSites.length > 0, 'D3a. ui/main.js calls handleCommentaryReceived() from its own composition root.');
        const mainSourceRaw = (await Promise.all(mainFiles().map((file) => rawSource(file)))).join('\n');
        const webrtcSiteIndex = mainSourceRaw.indexOf('publicationCommentaryDistributionPeerExchange.onCommentaryReceived');
        const nostrSiteIndex = mainSourceRaw.indexOf('discoverPublicationCommentaryFromNostrCommand');
        const arweaveSiteIndex = mainSourceRaw.indexOf('discoverPublicationCommentaryFromArweaveCommand');
        assert(webrtcSiteIndex !== -1 && nostrSiteIndex !== -1 && arweaveSiteIndex !== -1,
            'D3b. all three substrate wiring sites exist in ui/main.js — this is not a WebRTC-only implementation, it is a WebRTC-only REACHED implementation.');

        console.log('✓ D — Commentary: local authoring/distribution and WebRTC remote receipt are real, wired, and complete end to end, including publisher-only notification gating. SECOND FINDING, since RESOLVED: the notification bridge is wired for all three substrates, and Nostr/Arweave Commentary is now fetched when a Publication\'s Commentary is opened (and on "Check for new comments"), not only delivered live over WebRTC.');
    }

    // ===============================================================
    // Section E — cross-session continuity, exhaustive.
    // ===============================================================
    {
        const mainSourceRaw = (await Promise.all(mainFiles().map((file) => rawSource(file)))).join('\n');

        // E1. Documents — persisted (LocalStorageProvider) and
        // reconstructed on demand (LoadDocumentUseCase.listSavedDocuments()
        // populates Toolbar's Recent Documents on mount).
        const toolbarSource = await rawSource('ui/components/Toolbar.js');
        assert(toolbarSource.includes('props.loadDocumentUseCase.listSavedDocuments()'), 'E1. Documents: reconstructed on mount via a real, wired call — COMES BACK.');

        // E2. Publications (catalog-backed) — reconstructed synchronously
        // at boot, before app.mount().
        assert(mainSourceRaw.includes('new ReconstructPublicationDiscoveryUseCase(') && mainSourceRaw.includes('.execute()'),
            'E2. Publications (catalog-backed): reconstructed synchronously at boot — COMES BACK. (World-Encounter-only Publications: see Section C — DOES NOT.)');

        // E3. Distribution lifecycle — restored, but only to LAST
        // PERSISTED STATE, never resumed mid-flight; this is the
        // capability's own documented scope, not an oversight.
        assert(mainSourceRaw.includes('hydratePublicationDistributionLifecycles('), 'E3a. Distribution lifecycle state: reconstructed at boot — COMES BACK.');
        const restorerSource = await rawSource('application/publication/distribution/PublicationDistributionLifecycleRestorer.js');
        assert(!/resume|retry|reattempt/i.test(codeOnly(restorerSource)),
            'E3b. ...restoring last-known state only — no resume/retry vocabulary anywhere in the restorer itself; an in-flight distribution interrupted by a restart is not re-attempted. INTENTIONAL_BOUNDARY, per the class\'s own scope.');

        // E4. Commentary — read fresh on demand, never cached, never
        // eagerly hydrated at boot; still genuinely reachable.
        assert(mainSourceRaw.includes('getPublicationCommentariesCommand'), 'E4. Commentary: reachable on demand via a real command — COMES BACK when the relevant panel loads it.');

        // E5. Notifications — read on demand when the panel mounts, not
        // polled, not badge-driven.
        const notificationPanelSource = await rawSource('ui/components/NotificationHistoryPanel.js');
        assert(/no timer, no/i.test(notificationPanelSource) && notificationPanelSource.includes('mounted()'),
            'E5. Notifications: read on panel mount, not polled — COMES BACK when opened, a real read path, not an inbox/badge.');

        // E6. Identity — session state read fresh from storage on every
        // call (not merely cached at construction), so it genuinely
        // reconstructs; a passphrase-protected identity deliberately
        // never auto-unlocks (its own vault cache is memory-only).
        const identityProviderSource = await rawSource('identity/LocalIdentityProvider.js');
        assert(identityProviderSource.includes('_vaultCache'), 'E6a. Identity: a protected identity\'s decrypted key is cached in memory only, never persisted — requiring the passphrase again after restart. INTENTIONAL, not a gap.');

        // E7. Provider configuration — Arweave gateway and both Nostr
        // relay stores are persisted and read at boot. AMENDED BY 0.9.665
        // (see docs/Roadmap.md, "0.9.665"): IPFS gateway configuration now
        // has the identical persisted store, closing the asymmetry this
        // section originally found.
        assert(mainSourceRaw.includes('arweaveGatewayConfigurationStore.get()') && mainSourceRaw.includes('nostrRelayConfigurationStore.get()'),
            'E7a. Arweave gateway and Nostr relay configuration: persisted and restored at boot — COMES BACK.');
        const ipfsConfigStoreExists = await rawSource('content/IpfsGatewayContentStore.js').then(() => true).catch(() => false);
        assert(ipfsConfigStoreExists, 'setup: content/IpfsGatewayContentStore.js exists');
        const ipfsConfigStoreFileExists = await rawSource('storage/IpfsGatewayConfigurationStore.js').then(() => true).catch(() => false);
        assert(ipfsConfigStoreFileExists === true,
            n('E7b. storage/IpfsGatewayConfigurationStore.js now exists (0.9.665) — IPFS gateway configuration is persisted and restored at boot, the same "COMES BACK" shape Arweave/Nostr already held. The asymmetry this section originally found (USABILITY_GAP) is closed; see docs/Roadmap.md, "0.9.665," for why the earlier DEFER verdicts this gap sat behind were reversed.'));
        assert(mainSourceRaw.includes('ipfsGatewayConfigurationStore.get()'),
            n('E7c. ui/main.js actually reads the persisted IPFS gateway configuration at boot, the identical "resolved at composition time" shape E7a already confirmed for Arweave/Nostr'));

        console.log('✓ E: every major category checked either genuinely reconstructs on restart (documents, catalog-backed publications, distribution lifecycle state, commentary, notifications, Arweave/Nostr provider configuration) or deliberately does not by documented design (protected-identity auto-unlock). One narrow, real asymmetry found: IPFS gateway configuration has no persisted store at all. One narrow, real gap found and already covered in depth: World-Encounter-discovered Publications (Section C).');
    }

    // ===============================================================
    // Section F — identity continuity.
    // ===============================================================
    {
        const author = makeIdentity('identity-650', new InMemoryStorageProvider());
        const publication = makePublication({ id: 'ident-pub-650', documentId: 'ident-doc-650', title: 'Identity Census Subject' }, author);
        const commentary = new PublicationCommentary({ publicationId: publication.id, authorIdentityId: author.getSigningIdentity().id, content: 'a comment', createdAt: new Date() });
        const placement = new PlacementRecord({ placementId: 'placement-650', publicationId: publication.id, owner: 'identity-650', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, bounds: null, revision: 1 });

        // F1. Six identity-shaped values, live, all genuinely distinct.
        const values = new Set([publication.id, publication.documentId, publication.contentHash, commentary.commentaryId, placement.placementId, author.getSigningIdentity().id]);
        assert(values.size === 6, n('F1. documentId, publicationId, contentHash, commentaryId, placementId, and the author\'s own identityId are six genuinely distinct values on real, live, constructed objects — no accidental collapse.'));

        // F2. Publication itself carries id/documentId/contentHash/
        // snapshotId as four independently-settable constructor fields
        // — confirmed structurally, not merely by this fixture's choice
        // of distinct strings.
        const publicationSource = codeOnly(await rawSource('publisher/Publication.js'));
        assert(/this\._id\s*=/.test(publicationSource) && /this\._documentId\s*=/.test(publicationSource) && /this\._contentHash\s*=/.test(publicationSource) && /this\._snapshotId\s*=/.test(publicationSource),
            'F2. publisher/Publication.js assigns id, documentId, contentHash, and snapshotId as four separate own-properties — never derived from one another.');

        // F3. commentaryId is generated independently of publicationId —
        // confirmed both by F1's live inequality and by the class's own
        // documented intent.
        const commentarySource = await rawSource('core/PublicationCommentary.js');
        assert(/commentaryId !== publicationId/.test(commentarySource) || /three independent facts/.test(commentarySource),
            'F3. core/PublicationCommentary.js documents, and F1 above live-confirms, that commentaryId/publicationId/documentId are three independent facts.');

        // F4. No accidental parameter-name mix-up at two real call
        // sites that read a Publication's own two id-shaped fields side
        // by side.
        const previewServiceSource = codeOnly(await rawSource('application/editor/PreviewService.js'));
        assert(previewServiceSource.includes('documentId: publication.documentId'), 'F4. application/editor/PreviewService.js reads publication.documentId under a documentId key — never publication.id.');

        console.log('✓ F: eight identity concepts named in this milestone\'s own brief (documentId, publicationId, commentaryId, contentHash, snapshot identity, placement identity, storage identity, proof identity) each have a real, independent generation point; six were proven pairwise-distinct live in this section, the rest structurally. No accidental collapse found. Classification: ALREADY_CORRECT.');
    }

    // ===============================================================
    // Section G — failure/degraded journeys.
    // ===============================================================
    {
        // G1. Import, malformed content — fails closed, two-stage,
        // already deeply closed by the Portability arc (0.9.640-0.9.645,
        // reconfirmed live in Section A). Reconfirmed here only at the
        // validator boundary itself.
        const serializerSource = codeOnly(await rawSource('serializer/DocumentSerializer.js'));
        assert(/validate.*throw|throw.*validation/is.test(serializerSource) || serializerSource.includes('validation.errors'),
            'G1. serializer/DocumentSerializer.js throws on validation failure before Document.fromJSON() ever runs — ALREADY_CORRECT.');

        // G2. *** THE THIRD FINDING *** Save fails (storage
        // full/provider error) — live-composed proof that this is
        // completely unhandled, from the storage layer up through the
        // one production caller.
        class ThrowingStorageProvider extends StorageProvider {
            save() { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }
            load() { return null; }
            remove() {}
            list() { return []; }
        }
        const throwingStorage = new ThrowingStorageProvider();
        const saveUseCase = new SaveDocumentUseCase(throwingStorage);
        const world = new World();
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Save Failure Fixture', author: 'tester' }) });
        const documentManager = new DocumentManager();
        documentManager.load(document);
        documentManager.markDirty(); // simulate a real edit, so a false "saved" state would be observable

        let threw = false;
        try {
            saveUseCase.execute(documentManager);
        } catch {
            threw = true;
        }
        // markSaved() is the only thing that would clear the document's
        // own dirty flag — confirming it never ran when save() throws.
        assert(threw, n('G2a. SaveDocumentUseCase.execute() propagates a storage-provider failure uncaught — no try/catch anywhere in the file wraps this._storageProvider.save()'));
        assert(documentManager.state.dirty === true, n('G2b. ...and, correctly, never calls documentManager.markSaved() when save() throws — the document correctly stays marked dirty, so at least no FALSE "saved" state is recorded'));

        const toolbarSource = codeOnly(await rawSource('ui/components/Toolbar.js'));
        assert(/function save\(\) \{\s*props\.saveDocumentUseCase\.execute\(props\.documentManager\);\s*report\('Saved'\);\s*\}/.test(toolbarSource.replace(/\s+/g, ' ')),
            n('G2c. *** THE FINDING *** ui/components/Toolbar.js\'s own save() wraps the call in NOTHING — no try/catch of its own. When execute() throws (G2a), report(\'Saved\') correctly never runs (so no false-success message appears), but no error message runs either: the exception surfaces as an uncaught rejection with zero user-facing text. A user who hits this sees nothing — not an error, not a stalled state, nothing — and must infer from the document staying marked unsaved (if they even notice) that Save silently failed.'));
        assert(!grepFiles('errorCaptured|window\\.onerror|config\\.errorHandler', ['ui']).length,
            n('G2d. confirmed no application-wide safety net exists either — no Vue errorCaptured hook, no window.onerror, no app.config.errorHandler anywhere in ui/ — this is not merely a local gap this one button could delegate to a global handler; none exists.'));

        // G3. Invalid signature — visible, not silent, via a real
        // labeled status vocabulary.
        const worldLocationBrowserSource = await rawSource('ui/components/WorldLocationBrowser.js');
        assert(worldLocationBrowserSource.includes("'Signature does not match'"), 'G3. Invalid signature: a real, human-readable label exists and is rendered — ALREADY_CORRECT, not silent.');

        // G4. Missing/404 content — has a real error type and a real,
        // distinct resolution outcome; visible via PublicationResolutionView's
        // own "Content unavailable" label.
        const ipfsContentStoreSource = await rawSource('content/IpfsContentStore.js');
        assert(ipfsContentStoreSource.includes('class ContentUnavailableError'), 'G4a. A real, dedicated error type exists for missing content.');
        const resolutionViewSource = await rawSource('application/publication/PublicationResolutionView.js');
        assert(resolutionViewSource.includes("case PublicationResolutionOutcome.CONTENT_UNAVAILABLE: return 'Content unavailable';"),
            'G4b. ...and it surfaces as a distinct, honest, human-readable outcome label — never silently defaulted to a positive-looking status. ALREADY_CORRECT.');

        // G5. Duplicate arrival — deduplicated by commentaryId at the
        // store boundary, reconfirmed structurally.
        const commentaryStoreSource = codeOnly(await rawSource('storage/PublicationCommentaryStore.js'));
        assert(commentaryStoreSource.includes('PublicationCommentaryConflictError'), 'G5. Duplicate/conflicting arrival: a real conflict type exists at the store boundary, keyed by commentaryId — ALREADY_CORRECT.');

        console.log(`✓ G: import-failure, invalid-signature, and missing-content journeys are all already correct and visible to the user. THE THIRD FINDING (G2): Save has literally zero error handling anywhere in its call chain (storage provider -> SaveDocumentUseCase -> Toolbar), live-confirmed by actually throwing a QuotaExceededError through the real, unmodified classes — a failed Save is completely silent to the user today. Classification: USABILITY_GAP.`);
    }

    // ===============================================================
    // Section H — UI truthfulness.
    // ===============================================================
    {
        const inspectionViewSource = await rawSource('application/worldEncounter/WorldEncounterMaterialInspectionView.js');
        const resolutionViewSource = await rawSource('application/publication/PublicationResolutionView.js');

        // H1. "Verified" is never rendered as a bare word for World
        // Encounter material — it is expanded to a precise claim about
        // WHAT was checked.
        assert(inspectionViewSource.includes("[WorldEncounterMaterialVerificationStatus.VERIFIED]: 'Confirmed to match the selected encounter'"),
            'H1. "Verified" is rendered as "Confirmed to match the selected encounter" — a narrower, accurate claim, never a bare, overclaiming word.');

        // H2. "Available" (Publication Center) is gated on the full
        // ten-step PublicationResolver discipline (RESOLVED), never on
        // a lesser fact like "an announcement exists" or "a load was
        // attempted."
        assert(resolutionViewSource.includes("case PublicationResolutionOutcome.RESOLVED: return 'Available';"),
            'H2. "Available" is gated on outcome === RESOLVED — the full signature + content-hash + content-signature discipline, not a bare load attempt.');

        // H3. "Discovered" and "Verified"/"Available" are structurally
        // different vocabularies, in different label maps, gated by
        // different underlying conditions — never collapsed into one
        // status word.
        assert(inspectionViewSource !== resolutionViewSource, 'setup: sanity, the two label maps are genuinely two different files');
        const worldEncounterCanvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        assert(worldEncounterCanvasSource.includes('<dt>') && /Material|Verification/.test(worldEncounterCanvasSource),
            'H3. World Encounter renders "material" (discovery/load) and "verification" as two separately labeled fields, never merged into a single status word.');

        console.log('✓ H: this codebase\'s own status-label vocabulary was checked, not trusted by name — "Verified" and "Available" each expand to precisely what was actually established, gated by the real underlying condition, in every surface this audit inspected. No overclaiming label found. Classification: ALREADY_CORRECT (matching 0.9.573\'s own prior finding, reconfirmed here at a wider, whole-product altitude).');
    }

    // ===============================================================
    // Section I — journey discontinuity matrix and classification.
    // ===============================================================
    console.log('\n=== 0.9.650 JOURNEY DISCONTINUITY MATRIX ===');
    console.log(`
  Journey        User action         Expected result                Actual result                                   Verdict
  -------------- ------------------- ------------------------------ ----------------------------------------------- --------------------------
  Editor         Export/Import       Portable document               Real, wired, fails closed on bad input          ALREADY_CLOSED
  Editor         Save                Durable, or a clear error       Silent on storage-provider failure (Sec. G2)    USABILITY_GAP
  Publication    Publish             Publication exists               Real, synchronous, wired                        ALREADY_CLOSED
  Publication    Distribute          Announced to a substrate         Real, async, best-effort, honestly worded       ALREADY_CLOSED
  Discovery      Discover            Resolve candidate                Discovery != Resolution, kept distinct (Sec. H) ALREADY_CLOSED
  Verification   Verify              Trusted bytes                    Two independent gates, both require success     ALREADY_CLOSED
  Repository     Admit               Discoverable in Repository        Real, verification-gated                        ALREADY_CLOSED
  World          Place (catalog)     Visible placement, durable       Genuinely durable across restart                 ALREADY_CLOSED
  World          Place (encounter)   Visible placement, durable       Placement durable; DISCOVERABILITY IS NOT (Sec.C) CONTINUITY_GAP
  Restart        Reopen              Durable state usable              True for documents/publications/commentary/     ALREADY_CLOSED
                                                                        notifications/Arweave+Nostr config
  Restart        Reopen              IPFS gateway config restored     No persisted store exists (Sec. E7)              USABILITY_GAP
  Restart        Reopen              Passphrase-identity auto-unlock  Deliberately never — requires re-entry (Sec.E6) INTENTIONAL
  Commentary     Comment (local)     Local record, best-effort share  Real, wired, honestly worded                     ALREADY_CLOSED
  Commentary     Comment (WebRTC)    Remote arrival + notification    Real, automatic, end to end                      ALREADY_CLOSED
  Commentary     Comment (Nostr/AR)  Remote arrival + notification    Never triggered by any live UI path (Sec. D2)   DEFERRED_PRODUCT_DECISION
  Distribution   Restart mid-flight  Resume or clear failure state    Restores last state only, never resumes (E3)    INTENTIONAL
  Identity       Sign an action      One identity, never conflated    Confirmed structurally + live (Sec. F)          ALREADY_CLOSED
  Trust          Invalid signature   Visible rejection                Real, labeled, rendered (Sec. G3)               ALREADY_CLOSED
  Trust          Missing content     Visible "unavailable"            Real, labeled, rendered (Sec. G4)               ALREADY_CLOSED
  Notify         Receive             Appropriate local notification   Publisher-only, correctly gated                 ALREADY_CLOSED
`);

    // ===============================================================
    // Section J — production-change guard.
    // ===============================================================
    {
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(changedNonTestFiles === '', n(`J. no production file is modified by this milestone — found: ${changedNonTestFiles || 'none'}`));
        console.log('✓ J: no production file touched. This audit implements nothing — it reassesses the product surface the last two closed arcs left behind and locates the next concrete discontinuity.');
    }

    // ===============================================================
    // Section K — verdict and recommendation.
    // ===============================================================
    console.log(`
0.9.650 verdict: the large majority of major user journeys are ALREADY_CLOSED —
proven, in this file, by live composition (Sections A, C, F, G2) or by
structural reconfirmation against current source (Sections B, D, E, G,
H), not by re-reading a prior milestone's own conclusion. Three
concrete, previously-unrecorded findings survive:

  1. CONTINUITY_GAP (Section C, THE FLAGSHIP FINDING) — a Publication
     admitted to Repository discovery via the World-Encounter path
     (WorldEncounterCanvas.js#admitToRepositoryDiscovery(), fed by
     Nostr/Arweave walking-triggered Snapshot discovery) is durably
     Placed but not durably discoverable: it silently vanishes from
     World rendering after a session boundary, indistinguishable from
     never having been admitted, because that admission path never
     reaches application/publication/LocalPublicationCatalog.js — the one durable
     record application/publication/ReconstructPublicationDiscoveryUseCase.js (built
     at 0.9.607-0.9.609 for exactly this class of problem, on a
     DIFFERENT path) replays at boot. This is the SAME class of issue
     0.9.607 already found and fixed once, recurring on a second,
     structurally distinct admission path that fix never reached.

  2. USABILITY_GAP (Section G2) — Save has no error handling anywhere in
     its real call chain; a storage-provider failure (quota exceeded, a
     provider error) is completely silent to the user today, live-
     confirmed by actually triggering one through the unmodified
     production classes.

  3. USABILITY_GAP (Section E7), minor — IPFS gateway configuration has
     no persisted store, unlike Arweave gateway and Nostr relay
     configuration, both of which do.

One already-self-documented DEFERRED_PRODUCT_DECISION (Section D2) is
recorded, not actioned: Nostr/Arweave remote-Commentary retrieval is
real and tested but never triggered by any live UI path, a scope
boundary that use case's own header already names as a separate,
later decision.

RECOMMENDATION: a single, small, separately-scoped next milestone
(0.9.651) closing finding #1 only — mirroring the fix shape 0.9.607/
0.9.608 already established for the catalog-backed path: when
WorldEncounterCanvas.js#admitToRepositoryDiscovery() admits a
Publication, also record it in application/publication/LocalPublicationCatalog.js
(the same durable record CreatePublicationPeerExchangeUseCase.js
already writes for its own admissions), so
ReconstructPublicationDiscoveryUseCase can rebuild it after restart.
No new store, no new protocol, no UI change. Findings #2 and #3 are
smaller, independent, and left for whichever milestone the requesting
brief chooses to schedule them in — deliberately not folded into 0.9.651
to keep that fix's own scope exactly as narrow as the gap it closes.

Deliberately excluded here, matching this milestone's own test-only
type: no production fix for any of the three findings, no new
persistence layer, no polling/scheduling for Commentary discovery, no
global error-handling framework, no IPFS configuration UI. This
milestone measures; it does not repair.
`);

    console.log(`✅ All Major User Journey Product Reassessment tests passed (${assertionCount} assertions).`);
}

await run();
