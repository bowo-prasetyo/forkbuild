import WorldEncounterMarker from './WorldEncounterMarker.js';
import PublicationCommentaryRemoteCheck from './PublicationCommentaryRemoteCheck.js';
import WandererMarker from './WandererMarker.js';
import WorldDistributionDialog from './WorldDistributionDialog.js';
import { describeWorldFromDiscoveryRegistry } from '../../application/discovery/WorldDiscoveryRegistryProjection.js';
// Most computed properties and methods live in ./worldEncounterCanvas/,
// grouped by concern.
import { observerLocalEncounterMethods } from './worldEncounterCanvas/observerLocalEncounterMethods.js';
import { selectionOutcomeMethods } from './worldEncounterCanvas/selectionOutcomeMethods.js';
import { materialAndDistributionMethods } from './worldEncounterCanvas/materialAndDistributionMethods.js';
import { snapshotComparisonMethods } from './worldEncounterCanvas/snapshotComparisonMethods.js';
import { publicationDiscoveryMethods } from './worldEncounterCanvas/publicationDiscoveryMethods.js';
import { canvasProjectionComputed } from './worldEncounterCanvas/canvasProjectionComputed.js';
import { selectionInspectionComputed } from './worldEncounterCanvas/selectionInspectionComputed.js';
import { distributionComputed } from './worldEncounterCanvas/distributionComputed.js';
import { snapshotComparisonComputed } from './worldEncounterCanvas/snapshotComparisonComputed.js';
import { encounterInspectionPanelTemplate } from './worldEncounterCanvas/templates/encounterInspectionPanel.js';
import { observerLocalEncounterPanelTemplate } from './worldEncounterCanvas/templates/observerLocalEncounterPanel.js';
import { snapshotPanelsTemplate } from './worldEncounterCanvas/templates/snapshotPanels.js';
import { outcomeAndMaterialPanelsTemplate } from './worldEncounterCanvas/templates/outcomeAndMaterialPanels.js';
import { publicationDiscoveryPanelsTemplate } from './worldEncounterCanvas/templates/publicationDiscoveryPanels.js';

// World Encounter Canvas: a simple 2D World View of encounterable
// publications and avatars, plus the Wanderer's own marker.
//
//   WorldEncounterView (describeWorldEncounterView())
//             │
//             ▼
//   WorldEncounterCanvas
//        ├── WorldEncounterMarker × publications
//        ├── WorldEncounterMarker × avatars
//        ├── "Discovered here" markers (observer-local encounters)
//        └── WandererMarker
//
// A SPATIAL REPRESENTATION, NEVER SPATIAL INTELLIGENCE. Every object renders
// regardless of distance; there is no proximity or relevance filter, and no
// sorting (rows keep `view`'s order). NO DISTANCE, NEAREST, NEARBY, RADIUS, SCORE, RANK, TRUST, VERIFIED,
// WINNER, OR CORRECTNESS VOCABULARY OF ANY KIND. Publications and avatars
// stay two separate arrays and two `v-for` blocks. Counts come from the
// arrays, not `view.isEmpty`. A malformed `view` renders as empty and never
// throws; the Wanderer always renders.
//
// SCREEN X ← WORLD X; SCREEN Y ← WORLD Z. projectToCanvas() (in
// ./worldEncounterCanvas/canvasProjectionComputed.js) is a fixed linear
// transform onto a square viewBox: no pan, zoom or auto-fit (unlike
// WorldMapPanel), and world `y` is ignored.
//
// INPUT: A `view` OR A LIVE `registry`. `view` is exactly
// application/worldEncounter/WorldEncounterView.js's describeWorldEncounterView() result;
// this component never joins, fetches or recomputes encounter data (see
// application/worldEncounter/WorldEncounterReadModel.js, core/WorldEncounter.js). A live
// WorldDiscoverySourceRegistry may be passed as `registry` instead:
// `effectiveView` uses the registry-derived `worldView` when `registry` is
// supplied, else `view`, never both. mounted() seeds, then subscribes;
// beforeUnmount() unsubscribes idempotently. refreshWorldViewFromRegistry()
// is the only writer of `worldView` and the only caller of
// describeWorldFromDiscoveryRegistry(); every write replaces the snapshot
// wholesale, because the registry's listener carries no detail. This
// component never calls deriveWorldEncounters(), assembleWorldDiscoveryInputs()
// or describeWorldFromDiscoverySources(), never reads registry.listSources()
// or `source.origin` itself, and never calls registry.setSource()/
// removeSource()/clear(): membership is the registry's decision. A mounted
// canvas stays bound to the `registry` it mounted with (no runtime registry
// prop swapping); re-mount to observe another.
//
// PAGE-LOCAL STATE ONLY. `wandererPosition`, every selection, every
// inspection result and every in-flight flag live in this component's
// `data()`. Nothing here persists it to a `StorageProvider`, broadcasts it
// to a peer, or outlives the component instance.
//
// SELECTION. selectEncounter() is the only writer of `selectedEncounter`,
// stored verbatim as `{ kind, objectId }` (one selection state, never split
// by kind). Selecting never inspects anything by itself.
// `selectedEncounterInspection` joins it against `effectiveView` through
// describeWorldEncounterInspection(); when the object has left the World it
// is null and the panel says so, never showing stale fields. The selection
// itself is kept, so a returning object reappears automatically. `isSigned`
// renders literally as "Signed: Yes/No", never as verified/trusted, and
// `publisherIdentity` renders as its whole structure, never one
// cherry-picked field.
//
// SOURCE RESOLUTION. With a `registry`, refreshSelectionOutcome() writes
// `selectionOutcome` = { status, candidates, resolvedSelection } (data, not a
// computed: a class instance prop gives Vue nothing to track). Without a
// registry there is no resolution, never a fabricated origin.
// `resolvedEncounterSelection` = { kind, objectId, origin } is automatic when
// RESOLVED; when AMBIGUOUS it is only the Wanderer's explicit
// chooseSelectionOrigin() pick, re-checked against the current candidates on
// every read. Nothing ever picks `candidates[0]` or prefers 'local'.
//
// MATERIAL INSPECTION. This component is a consumer, never a second
// orchestrator: refreshMaterialInspection() calls
// inspectWorldEncounterMaterial() with the caller-injected `materialSources`/
// `materialVerifier`, and never calls loadWorldEncounterMaterial() or a
// verifier directly. No material source, no material inspection. Material
// never loads while the selection is ambiguous. `materialInspection` is
// rewritten only when the resolved selection genuinely changes (see
// resolvedEncounterSelectionsEqual()), and is cleared synchronously on that
// change so the previous selection's material can't be acted on in the gap.
// A request counter guards against a stale async response overwriting a
// newer one; it is not a cache and never retries. Load/verification status
// render through application/worldEncounter/WorldEncounterMaterialInspectionView.js labels,
// never as "trusted"/"authentic"/"safe".
//
// DECENTRALIZED LEADS. With a `worldDiscoveryLeadRegistry`,
// refreshDecentralizedLeadOutcome() writes `decentralizedLeadOutcome` from
// `selectedEncounter` alone (a lead is keyed by { kind, objectId }, never by
// origin). Association evidence is the caller's own
// (`decentralizedLeadAssociations`, or live via `leadAssociationsQuery`);
// this component never derives evidence from a lead's tag or uri
// (see core/DecentralizedWorldEncounterLeadAssociation.js) and never calls
// queryDecentralizedWorldDiscovery(). `resolvedLead` mirrors
// resolvedEncounterSelection (automatic when RESOLVED, explicit
// chooseDecentralizedLead() when AMBIGUOUS) and, once set, is forwarded to
// material inspection: resolving it is the routing decision (see
// application/worldEncounter/DecentralizedWorldEncounterLeadAwareMaterialLoading.js).
//
// DISTRIBUTION. Observation: `distributionLifecycleStore` is read and
// subscribed per selected Publication; `distributionMaterialState`/
// `distributionDiscoveryState` render {{ distributionMaterialState }} /
// {{ distributionDiscoveryState }} as ABSENT/PRESENT, with
// getDiscoveryObservations() listing one row per substrate. No second
// lifecycle, no polling (no setInterval()). Action: `distributionCommand
// (publication, discoveryProvider)` is the entire request-building boundary.
// This component never imports PublicationDistributionOrchestrator.js,
// PublicationDistributionExecutor.js,
// PublicationDistributionRuntimeComposition.js,
// ArweavePublicationMaterialUploader.js or
// NostrPublicationDiscoveryPublisher.js, and never supplies
// `serializedMaterial`, `materialStorage`, `arweaveUploaderOptions` or
// `nostrPublisherOptions`. `distributablePublication` is the Publication
// material inspection already loaded, never a second fetch. Execution state
// is ephemeral, never a lifecycle value; a rejection or synchronous throw
// becomes one PLAIN NOTICE — NEVER A RECLASSIFIED DOMAIN RESULT. It never inspects a resolved result:
// the lifecycle subscription is the only place results appear. Buttons use
// `:disabled="!distributablePublication || distributionExecuting"` plus a
// method-level re-check, so repeated clicks never start a second call.
// `selectedDiscoveryProvider` is exactly one of 'nostr'/'arweave': one
// selection, never fan-out.
//
// Snapshot distribution is a separate protocol with its own panel and
// command (`snapshotDistributionCommand`); it has no lifecycle store, so
// the resolved `{ contentReference, announcement }` is stored directly.
// Snapshot discovery/attribution (`discoverSnapshotCommand` +
// resolveSnapshotPublicationAttribution()) is a third, separate action. All
// distribution controls now live in WorldDistributionDialog.js.
//
// DISCOVER PUBLICATION. `discoveryCommand({ objectId, discoveryTag })`
// renders its `{ discovery, resolution, inspection, provenance }` result in
// a secondary popup (`publicationDiscoveryOpen`), through the same
// Material/Verification markup as a selection: the existing inspection
// mechanism stays canonical. A discovered Publication is never a marker,
// never a `selectedEncounter`, and never touches `materialInspection`
// (local/decentralized separation). `discoveryTag` starts from
// `defaultDiscoveryTag` ('forkbuild-publication') but stays freely editable.
// None of it is persisted, and none of it is written into any lifecycle
// vocabulary.
// Only a VERIFIED result is selectable as `selectedDiscoveredPublication`,
// which never auto-resets.
//
// PROVENANCE. `materialProvenance` is derived from `materialInspection`;
// `discoveryResult.provenance` is rendered verbatim, never re-derived. The
// "Source" row sits beside Material/Verification and replaces neither.
//
// COMPARISON AND SNAPSHOT CONTENT. "Compare with…" arms
// `armedForComparisonSelection`, and the next marker click (the same
// `select` path) sets `comparisonEncounter`. There is no implicit
// comparison. `worldSnapshotComparisonResult` is a live computed, never a
// cached pair. The comparison target gets its own material inspection
// (never with a lead). "View Snapshot" and "View Content Comparison" are
// explicit actions that only observe already-loaded material, reset on each
// fresh selection, and collapse when material stops being available.
// unregisterSelectedSnapshot() is the one registry-mutating action here.
//
// COMMENTARY. `getPublicationCommentariesCommand`/
// `addPublicationCommentaryCommand` are the same session-backed functions
// ui/views/WorldView.js already gives OwnPublicationPanel. THE PUBLICATIONID IS THE ENCOUNTER'S OWN objectId,
// never the loaded material's, so commentary never waits on material loading. Collapsed by default, loaded
// only on first expansion; all commentary state resets on each selection.
// Authorship is never UI-supplied; `viewerIdentityId` only chooses between
// the compose form and a sign-in hint.
//
// OBSERVER-LOCAL ENCOUNTERS. `observerLocalEncounterRegistry` (an
// application/worldEncounter/ObserverLocalEncounterStore.js) is a separate prop and array,
// never merged into `registry`. Its markers are plain `<g>` elements
// labelled "Discovered here", never a WorldEncounterMarker and never
// `selectedEncounter`. `projectedObserverLocalEncounters` carries exactly
// `publicationId`, `contentHash`, `x`, `y`; that identity
// (`publicationId` + `contentHash`) is deliberately never a `documentId`, a
// locator or a claimed position, and it never claims the publisher's own `claimedPosition` was honored, used,
// or trusted. A row is hidden once an authoritative row exists for the same
// publicationId, and reappears if that row leaves.
//
// Clicking one sets `selectedObserverLocalEncounter`, a separate selection
// concept. Its material resolves without the registry: origin =
// materializedSnapshotWorldOrigin(contentHash, publicationId), i.e.
// "snapshot:<contentHash>:<publicationId>", which routes to
// `materialSources.local` (bytes the cascade already materialized) through
// the same inspectWorldEncounterMaterial(). Once AVAILABLE + VERIFIED, the
// resolved Publication feeds Open/Fork/Explore commands (reusing
// PublicationCatalog.js's routes; NOT A FOURTH ACTION SET) and a separate
// commentary block; it is never the Publication Catalog/Repository browser, and nothing persists it
// ("find it again" is a separate product question).
//
// REPOSITORY ADMISSION. admitToRepositoryDiscovery() adds a resolved
// Publication to `decentralizedPublicationDiscoveryProvider` and
// `publicationAdmissionLog` only on AVAILABLE + VERIFIED, for primary,
// comparison and observer-local inspections alike, each sink with its own
// failure isolation. `claimedPosition` stays inert: admission says which
// Publication is knowable, never where it belongs. A KNOWN, PRE-EXISTING LIMIT:
// application/world/WorldNavigationSession.js's `_discoveryProvider` is a separate
// LocalDiscoveryProvider built in CreateWorldViewUseCase.js, so admission
// makes a Publication findable in Repository search (via
// CreateDiscoveryUseCase.js's CompositeDiscoveryProvider) but not resolvable
// by OwnPublicationPanel.

export default {
    name: 'WorldEncounterCanvas',
    components: { WorldEncounterMarker, WandererMarker, WorldDistributionDialog, PublicationCommentaryRemoteCheck },
    props: {
        // Exactly `describeWorldEncounterView()`'s result shape.
        view: {
            type: Object,
            default: () => ({
                isEmpty: true,
                publicationCount: 0,
                avatarCount: 0,
                totalCount: 0,
                publications: [],
                avatars: []
            })
        },
        // Optional live WorldDiscoverySourceRegistry
        // (application/discovery/WorldDiscoverySourceRegistry.js); see the header.
        registry: {
            type: Object,
            default: null
        },
        // Optional ObserverLocalEncounterStore (application/worldEncounter/ObserverLocalEncounterStore.js),
        // seeded and subscribed like `registry` but never the same object and never
        // merged with it.
        observerLocalEncounterRegistry: {
            type: Object,
            default: null
        },
        // Optional `{ local, peer, decentralized }` WorldEncounterMaterialSource
        // objects, forwarded to inspectWorldEncounterMaterial(). Without them, no
        // material inspection.
        materialSources: {
            type: Object,
            default: null
        },
        // Optional verifier forwarded to inspectWorldEncounterMaterial(); without
        // one, loaded material verifies as UNVERIFIABLE.
        materialVerifier: {
            type: Object,
            default: null
        },
        // Optional DecentralizedWorldDiscoveryLeadRegistry
        // (application/discovery/DecentralizedWorldDiscoveryLeadRegistry.js); without it, no
        // lead resolution.
        worldDiscoveryLeadRegistry: {
            type: Object,
            default: null
        },
        // Caller-supplied association evidence, forwarded to
        // describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry().
        // Never derived here.
        decentralizedLeadAssociations: {
            type: Array,
            default: () => []
        },
        // Optional `() => associations[]`: the caller's own evidence, read fresh on
        // every lead refresh. Takes precedence over `decentralizedLeadAssociations`.
        leadAssociationsQuery: {
            type: Function,
            default: null
        },
        // Optional PublicationDistributionLifecycleMemoryStore-shaped store
        // (`get`/`subscribe`, optionally `getDiscoveryObservations`), observed for a
        // selected Publication. Never written to.
        distributionLifecycleStore: {
            type: Object,
            default: null
        },
        // Optional: the app-wide DecentralizedPublicationDiscoveryProvider
        // ui/views/WorldView.js injects, the admission target of
        // admitToRepositoryDiscovery(). Reused rather than a second provider. Not
        // the same as `distributionCommand`'s `discoveryProvider` argument, which is
        // the Nostr/Arweave ANNOUNCEMENT substrate string.
        decentralizedPublicationDiscoveryProvider: {
            type: Object,
            default: null
        },
        // Optional durable `{ add(publication) }` sink, in production a
        // LocalWorldEncounterPublicationAdmissionLog rebuilt into
        // `decentralizedPublicationDiscoveryProvider` at startup. Never
        // LocalPublicationCatalog: that stores signed core/DecentralizedPublication.js
        // envelopes, and handing it a plain Publication is unsafe (see
        // tests/DistributionResultPublicationCenterDeepLinkAudit.test.js).
        // Independent of the provider above; each is admitted into separately.
        publicationAdmissionLog: {
            type: Object,
            default: null
        },
        // Optional `(publication, discoveryProvider) -> Promise<PublicationDistributionResult
        // | null>`, called with the selected Publication and the Wanderer's
        // `selectedDiscoveryProvider` as the second argument.
        // Everything else a distribution needs (`serializedMaterial`,
        // `materialStorage`, `arweaveUploaderOptions`, `nostrPublisherOptions`,
        // `arweaveAnnouncementPublisherOptions`) is the caller's concern.
        distributionCommand: {
            type: Function,
            default: null
        },
        // Optional `(publication) -> Promise<{ contentReference, announcement }>`,
        // called with the same `distributablePublication` (see WorldView.js's
        // distributeWorldEncounterSnapshot()). Unlike `distributionCommand`, the
        // result is stored here: application/snapshot/SnapshotDistributionCommand.js has no
        // lifecycle store, so the resolved object is the only record.
        snapshotDistributionCommand: {
            type: Function,
            default: null
        },
        // Snapshot Distribution content backends ('ipfs'/'ar') currently
        // eligible, mirroring OwnPublicationPanel.js's prop.
        snapshotDistributionStorageTypes: {
            type: Array,
            default: () => []
        },
        // This replica's ANNOUNCEMENT_AND_DISCOVERY/CONTENT preferences (ui/main.js's
        // defaultAnnouncementDiscoveryProvider/defaultContentDistributionProvider),
        // read only to seed the initial selections below (see
        // application/PreferredProviderDefaultChoice.js). `selectedDiscoveryProvider`
        // is read by "Distribute Snapshot" too.
        defaultDiscoveryDistributionProvider: {
            type: String,
            default: 'nostr'
        },
        defaultContentDistributionProvider: {
            type: String,
            default: null
        },
        // Optional `({ objectId, discoveryTag }) -> Promise<{ discovery, resolution,
        // inspection }>`; without it there is no Discover Publication panel.
        discoveryCommand: {
            type: Function,
            default: null
        },
        // Canonical Publication discovery tag ('forkbuild-publication' from
        // ui/main.js via ui/views/WorldView.js), used only to seed `discoveryTag`.
        defaultDiscoveryTag: {
            type: String,
            default: ''
        },
        // Optional `(publication) -> Promise<{ outcome, bytes, candidates, locator,
        // storage, reason }>`, the same contract (and in the app, the same function)
        // as OwnPublicationPanel.js's `discoverSnapshotCommand`.
        discoverSnapshotCommand: {
            type: Function,
            default: null
        },
        // Optional `(publicationId) -> PublicationCommentary[]`, the same function
        // ui/views/WorldView.js gives ui/components/OwnPublicationPanel.js.
        // Synchronous.
        getPublicationCommentariesCommand: {
            type: Function,
            default: null
        },
        // Optional `({ publicationId, content }) -> { commentary, isNew }`.
        // Synchronous; sends only publicationId and content.
        addPublicationCommentaryCommand: {
            type: Function,
            default: null
        },
        // The viewer's identityId, or null when nobody is signed in. Only chooses
        // between the compose form and a sign-in hint; never sent.
        viewerIdentityId: {
            type: String,
            default: null
        },
        // Optional `(publication) -> void`, called with the resolved Publication
        // (never a bare id). In the app, the `/editor?load=<documentId>` navigation
        // PublicationCatalog.js's openPublication() performs.
        openPublicationCommand: {
            type: Function,
            default: null
        },
        // Like openPublicationCommand: the `/editor?fork=<documentId>&publication=<id>`
        // navigation of PublicationCatalog.js's forkPublication().
        forkPublicationCommand: {
            type: Function,
            default: null
        },
        // Like openPublicationCommand: the `/world/<documentId>` destination of
        // PublicationCatalog.js's viewWorld(); WorldView.js decides how to reach it.
        explorePublicationCommand: {
            type: Function,
            default: null
        }
    },
    data() {
        return {
            // Page-local only.
            wandererPosition: { x: 0, y: 0, z: 0 },
            // Page-local; `{ kind, objectId }` once a marker is selected.
            selectedEncounter: null,
            // Registry-derived snapshot; null when driven by the `view` prop.
            worldView: null,
            unsubscribeWorldRegistry: null,
            // Store-derived snapshot of observer-local encounters.
            observerLocalEncounters: [],
            unsubscribeObserverLocalEncounterRegistry: null,
            // The Wanderer's pick of one observer-local encounter,
            // `{ publicationId, contentHash }`. Never `selectedEncounter`.
            selectedObserverLocalEncounter: null,
            // Material/verification for `selectedObserverLocalEncounter`.
            observerLocalEncounterInspection: null,
            // Stale-response guard, bumped on each selection, dismissal and unmount.
            observerLocalEncounterInspectionRequestId: 0,
            // Observer-local commentary state, separate from the primary selection's so
            // both can be open at once.
            observerLocalEncounterCommentaryOpen: false,
            observerLocalEncounterCommentaries: [],
            newObserverLocalEncounterCommentaryText: '',
            observerLocalEncounterCommentarySubmitting: false,
            observerLocalEncounterCommentaryError: null,
            pendingObserverLocalEncounterCommentaryDraft: null,
            // Registry-derived classification of `selectedEncounter`; written only by
            // refreshSelectionOutcome().
            selectionOutcome: null,
            // The Wanderer's pick among AMBIGUOUS candidates, written only by
            // chooseSelectionOrigin() and reset by selectEncounter().
            resolvedSelectionChoice: null,
            // Material/verification for `resolvedEncounterSelection`; written only by
            // refreshMaterialInspection().
            materialInspection: null,
            // Stale-response guard for refreshMaterialInspection(), also bumped on
            // unmount.
            materialInspectionRequestId: 0,
            // Lead-registry classification of `selectedEncounter`; written only by
            // refreshDecentralizedLeadOutcome().
            decentralizedLeadOutcome: null,
            // The Wanderer's pick among AMBIGUOUS leads, written only by
            // chooseDecentralizedLead() and reset by selectEncounter().
            resolvedLeadChoice: null,
            unsubscribeWorldDiscoveryLeadRegistry: null,
            // The `{ material, discovery }` lifecycle for the selected Publication;
            // written only by refreshDistributionLifecycle().
            distributionLifecycle: null,
            unsubscribeDistributionLifecycle: null,
            // Ephemeral execution/error/request state for `distributionCommand`, reset
            // on each selection. Never a lifecycle fact.
            distributionExecuting: false,
            distributionError: null,
            distributionRequestId: 0,
            // Whether WorldDistributionDialog is open.
            distributionDialogOpen: false,
            // The Wanderer's Announcement/Discovery substrate for the next distribution,
            // starting from the saved preference, else 'nostr' (the same default as
            // PublicationDistributionRuntimeComposition.js). Never persisted.
            selectedDiscoveryProvider: this.defaultDiscoveryDistributionProvider || 'nostr',
            // `selectedDiscoveryProvider` is shared by "Distribute Publication" and
            // "Distribute Snapshot" (see WorldDistributionDialog.js).
            // Ephemeral execution/error/request/result state for
            // `snapshotDistributionCommand`, reset on each selection.
            snapshotDistributionExecuting: false,
            snapshotDistributionError: null,
            snapshotDistributionRequestId: 0,
            snapshotDistributionResult: null,
            // Backs `selectedDistributionStorage`; null until a storage is picked.
            selectedDistributionStorageChoice: null,
            // Remote Pinning (e.g. Pinata) draft for both distribution actions, shown
            // only for 'remote-pinning'. A plain object; never persisted.
            remotePinningDraft: { endpoint: '', credential: '', requestField: '', responseField: '' },
            // Ephemeral execution/error/request/result state for
            // `discoverSnapshotCommand`, reset on each selection.
            // `snapshotAttributionResult` is resolveSnapshotPublicationAttribution()'s
            // result, kept beside the discovery result.
            snapshotDiscoveryExecuting: false,
            snapshotDiscoveryError: null,
            snapshotDiscoveryRequestId: 0,
            snapshotDiscoveryResult: null,
            snapshotAttributionResult: null,
            // Whether the Publication Discovery popup is open. Never touches the
            // discovery fields inside it.
            publicationDiscoveryOpen: false,
            // Discover Publication input and ephemeral request state.
            // `discoveryTag` starts from `defaultDiscoveryTag` and stays editable.
            discoveryObjectId: '',
            discoveryTag: this.defaultDiscoveryTag,
            discovering: false,
            discoveryError: null,
            discoveryResult: null,
            discoveryRequestId: 0,
            // The Wanderer's pick of a VERIFIED discovered Publication; written only by
            // selectDiscoveredPublication() and never auto-reset.
            selectedDiscoveredPublication: null,
            // Comparison state: armed until the next marker click, which sets
            // `comparisonEncounter` via selectComparisonEncounter().
            armedForComparisonSelection: false,
            comparisonEncounter: null,
            comparisonSelectionOutcome: null,
            // Explicit-open flags for the Snapshot Content View and Content Comparison
            // panels, reset on each fresh selection. The panels also need the live
            // content-view computeds to be non-null.
            snapshotContentViewOpen: false,
            // Material inspection for the comparison target, with its own stale-response
            // guard.
            comparisonMaterialInspection: null,
            comparisonMaterialInspectionRequestId: 0,
            contentComparisonViewOpen: false,
            // Primary-selection commentary state, reset on each selectEncounter().
            // Collapsed by default, loaded only on first expansion.
            encounterCommentaryOpen: false,
            // In the order the command returned them; never sorted here.
            encounterCommentaries: [],
            // Cleared on success; left unchanged on failure.
            newEncounterCommentaryText: '',
            // Guards against overlapping submissions, like OwnPublicationPanel.js's
            // `publicationCommentarySubmitting`.
            encounterCommentarySubmitting: false,
            encounterCommentaryError: null,
            // `{ content, commentaryId, createdAt }` for the in-progress attempt, like
            // PublicationCard.js's/OwnPublicationPanel.js's `pendingCommentaryDraft`.
            pendingEncounterCommentaryDraft: null
        };
    },
    computed: {
        ...canvasProjectionComputed,
        ...selectionInspectionComputed,
        ...distributionComputed,
        ...snapshotComparisonComputed
    },
    methods: {
        // The only writer of `selectedEncounter`: stores `{ kind, objectId }`
        // verbatim. While comparison is armed, the click goes to
        // selectComparisonEncounter() instead and none of the resets below run.
        selectEncounter(encounter) {
            if (this.armedForComparisonSelection) {
                this.selectComparisonEncounter(encounter);
                return;
            }
            this.selectedEncounter = encounter;
            // Fresh selections never inherit an earlier explicit choice.
            this.resolvedSelectionChoice = null;
            this.resolvedLeadChoice = null;
            // Leads are refreshed first because refreshDecentralizedLeadOutcome() never
            // triggers material inspection itself; refreshSelectionOutcome()'s single
            // tail call then reads a current `resolvedLead`, so no source is loaded twice
            // for one selection.
            this.refreshDecentralizedLeadOutcome();
            this.refreshSelectionOutcome();
            // Distribution observation is keyed by the Publication id alone, not by
            // which origin served it.
            this.refreshDistributionLifecycle();
            // Clear per-selection action state and bump the request counters so a late
            // response can't write into the new selection.
            this.distributionExecuting = false;
            this.distributionError = null;
            this.distributionRequestId += 1;
            this.snapshotDistributionExecuting = false;
            this.snapshotDistributionError = null;
            this.snapshotDistributionResult = null;
            this.snapshotDistributionRequestId += 1;
            this.distributionDialogOpen = false;
            this.snapshotDiscoveryExecuting = false;
            this.snapshotDiscoveryError = null;
            this.snapshotDiscoveryResult = null;
            this.snapshotAttributionResult = null;
            this.snapshotDiscoveryRequestId += 1;
            // Explicitly opened panels never carry over to a new selection.
            this.snapshotContentViewOpen = false;
            this.contentComparisonViewOpen = false;
            this.encounterCommentaryOpen = false;
            this.encounterCommentaries = [];
            this.newEncounterCommentaryText = '';
            this.encounterCommentarySubmitting = false;
            this.encounterCommentaryError = null;
            // A retry draft's commentaryId is only valid for the publicationId it was
            // minted for.
            this.pendingEncounterCommentaryDraft = null;
        },
        // The only writer of `worldView` and the only caller of
        // describeWorldFromDiscoveryRegistry(). No-op without a `registry`.
        refreshWorldViewFromRegistry() {
            if (!this.registry) {
                return;
            }
            this.worldView = describeWorldFromDiscoveryRegistry(this.registry);
        },
        ...observerLocalEncounterMethods,
        ...selectionOutcomeMethods,
        ...materialAndDistributionMethods,
        ...snapshotComparisonMethods,
        ...publicationDiscoveryMethods
    },
    // Seed, then subscribe. No-op without a `registry`.
    mounted() {
        if (this.registry && typeof this.registry.subscribe === 'function') {
            this.refreshWorldViewFromRegistry();
            this.refreshSelectionOutcome();
            // Usually a no-op at mount (no comparison target yet).
            this.refreshComparisonSelectionOutcome();
            this.unsubscribeWorldRegistry = this.registry.subscribe(() => {
                this.refreshWorldViewFromRegistry();
                // A source appearing or leaving can change the open selection's candidates,
                // so the outcome must be recomputed explicitly (it is data, not a computed).
                this.refreshSelectionOutcome();
                // Same for a live comparison target, so a comparison whose source left stops
                // being shown as current.
                this.refreshComparisonSelectionOutcome();
            });
        }
        // The lead registry subscription, same shape.
        if (this.worldDiscoveryLeadRegistry && typeof this.worldDiscoveryLeadRegistry.subscribe === 'function') {
            this.refreshDecentralizedLeadOutcome();
            this.refreshMaterialInspection();
            this.unsubscribeWorldDiscoveryLeadRegistry = this.worldDiscoveryLeadRegistry.subscribe(() => {
                // refreshDecentralizedLeadOutcome() doesn't trigger material inspection, so
                // the listener does, once per notification.
                this.refreshDecentralizedLeadOutcome();
                this.refreshMaterialInspection();
            });
        }
        // The observer-local store subscription: seed, then subscribe.
        if (this.observerLocalEncounterRegistry && typeof this.observerLocalEncounterRegistry.subscribe === 'function') {
            this.refreshObserverLocalEncountersFromRegistry();
            this.unsubscribeObserverLocalEncounterRegistry = this.observerLocalEncounterRegistry.subscribe(() => {
                this.refreshObserverLocalEncountersFromRegistry();
            });
        }
    },
    beforeUnmount() {
        this.stopSubscription('unsubscribeWorldRegistry');
        this.stopSubscription('unsubscribeWorldDiscoveryLeadRegistry');
        this.stopSubscription('unsubscribeObserverLocalEncounterRegistry');
        // Invalidate every in-flight request so nothing is written after unmount.
        this.materialInspectionRequestId += 1;
        this.comparisonMaterialInspectionRequestId += 1;
        this.observerLocalEncounterInspectionRequestId += 1;
        this.stopSubscription('unsubscribeDistributionLifecycle');
        this.distributionRequestId += 1;
        this.snapshotDistributionRequestId += 1;
        this.snapshotDiscoveryRequestId += 1;
        this.discoveryRequestId += 1;
    },
    template: `
        <div class="world-encounter-view">
            <svg
                class="world-encounter-canvas"
                viewBox="0 0 600 600"
                role="img"
                aria-label="World View"
            >
                <rect class="world-encounter-canvas-background" x="0" y="0" width="600" height="600" />

                <text v-if="isWorldEmpty" class="world-encounter-canvas-empty-hint" x="300" y="24" text-anchor="middle">
                    Nothing encounterable here yet.
                </text>

                <WorldEncounterMarker
                    v-for="marker in projectedPublications"
                    :key="'publication:' + marker.objectId"
                    kind="PUBLICATION"
                    :object-id="marker.objectId"
                    :label="marker.label"
                    :x="marker.x"
                    :y="marker.y"
                    @select="selectEncounter"
                />

                <WorldEncounterMarker
                    v-for="marker in projectedAvatars"
                    :key="'avatar:' + marker.objectId"
                    kind="AVATAR"
                    :object-id="marker.objectId"
                    :label="marker.label"
                    :x="marker.x"
                    :y="marker.y"
                    @select="selectEncounter"
                />

                <!--
                    "Discovered here", never "placed". Its own @click to a separate method,
                    never @select and never a WorldEncounterMarker.
                -->
                <g
                    v-for="marker in projectedObserverLocalEncounters"
                    :key="'observer-local:' + marker.publicationId + ':' + marker.contentHash"
                    class="world-encounter-observer-local-marker"
                    :transform="'translate(' + marker.x + ',' + marker.y + ')'"
                    :data-publication-id="marker.publicationId"
                    @click="selectObserverLocalEncounter(marker)"
                >
                    <text class="world-encounter-marker-glyph" text-anchor="middle" dy="4">📄</text>
                    <text class="world-encounter-observer-local-label" text-anchor="middle" dy="18">Discovered here</text>
                    <title>This publication was discovered while you were here. Its publisher's own location claim has not been used as a World placement.</title>
                </g>

                <WandererMarker :x="projectedWanderer.x" :y="projectedWanderer.y" />
            </svg>

            ${encounterInspectionPanelTemplate}

            ${observerLocalEncounterPanelTemplate}

            ${snapshotPanelsTemplate}

            ${outcomeAndMaterialPanelsTemplate}

            ${publicationDiscoveryPanelsTemplate}
        </div>
    `
};
