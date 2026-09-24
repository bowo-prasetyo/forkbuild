import WorldEncounterMarker from './WorldEncounterMarker.js';
import PublicationCommentaryRemoteCheck from './PublicationCommentaryRemoteCheck.js';
import WandererMarker from './WandererMarker.js';
import WorldDistributionDialog from './WorldDistributionDialog.js';
import { describeWorldFromDiscoveryRegistry } from '../../application/discovery/WorldDiscoveryRegistryProjection.js';
import { describeWorldEncounterInspection } from '../../application/worldEncounter/WorldEncounterInspection.js';
import { WorldEncounterSelectionOutcomeStatus } from '../../application/worldEncounter/WorldEncounterSelectionOutcome.js';
import { resolveSavedProviderDefault } from '../../application/settings/SavedProviderDefaultChoice.js';
// `Publication` is needed for one check only: `loading.status === 'AVAILABLE'
// && loading.material instanceof Publication`, the same admission gate
// ui/views/DecentralizedPublicationsView.js's admitToRepositoryDiscovery()
// uses. 'AVAILABLE' is compared as a literal
// (WorldEncounterMaterialLoadStatus.AVAILABLE) so this file never imports
// application/worldEncounter/WorldEncounterMaterialLoading.js: it reacts only to
// inspectWorldEncounterMaterial()'s result.

import { Publication } from '../../publisher/Publication.js';
import { PublicationDistributionState } from '../../application/publication/distribution/PublicationDistributionLifecycle.js';
import { DecentralizedWorldEncounterLeadSelectionOutcomeStatus } from '../../application/worldEncounter/DecentralizedWorldEncounterLeadSelection.js';
import { describePublicationMaterialProvenanceFromInspection } from '../../application/publication/distribution/PublicationMaterialProvenance.js';
import { describeWorldEncounterPresentation } from '../../application/worldEncounter/WorldEncounterPresentation.js';
import { describeWorldSnapshotInspection } from '../../application/snapshot/WorldSnapshotInspection.js';
import { materializedSnapshotWorldOrigin } from '../../application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js';
import { describeWorldEncounterComparisonCandidate } from '../../application/worldEncounter/WorldEncounterComparisonCandidate.js';
import { compareSnapshotWorldPublications } from '../../application/snapshot/WorldSnapshotComparison.js';
import { describeWorldSnapshotContentView } from '../../application/snapshot/materialization/WorldSnapshotContentView.js';
import { describeWorldSnapshotContentComparisonView } from '../../application/snapshot/materialization/WorldSnapshotContentComparisonView.js';
// Most methods live in ./worldEncounterCanvas/, grouped by concern.
import { observerLocalEncounterMethods } from './worldEncounterCanvas/observerLocalEncounterMethods.js';
import { selectionOutcomeMethods } from './worldEncounterCanvas/selectionOutcomeMethods.js';
import { materialAndDistributionMethods } from './worldEncounterCanvas/materialAndDistributionMethods.js';
import { snapshotComparisonMethods } from './worldEncounterCanvas/snapshotComparisonMethods.js';
import { publicationDiscoveryMethods } from './worldEncounterCanvas/publicationDiscoveryMethods.js';

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
// SCREEN X ← WORLD X; SCREEN Y ← WORLD Z. projectToCanvas() is a fixed linear
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

const WORLD_HALF_SPAN = 50;
const CANVAS_SIZE = 600;

function projectToCanvas(value) {
    return CANVAS_SIZE / 2 + (value / WORLD_HALF_SPAN) * (CANVAS_SIZE / 2);
}

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
        // The one Arweave/IPFS/Remote-Pinning choice both distribution actions use,
        // mirroring OwnPublicationPanel.js's `distributionStorage`. With Snapshot
        // distribution available it is limited to `snapshotDistributionStorageTypes`
        // plus 'remote-pinning'; otherwise all three, defaulting to 'ar'. The saved
        // Content preference wins when eligible.
        selectedDistributionStorage: {
            get() {
                const eligible = this.snapshotDistributionCommand
                    ? [...this.snapshotDistributionStorageTypes, 'remote-pinning']
                    : ['ar', 'ipfs', 'remote-pinning'];
                return this.selectedDistributionStorageChoice
                    || resolveSavedProviderDefault(this.defaultContentDistributionProvider, eligible, null)
                    || (this.snapshotDistributionCommand ? this.snapshotDistributionStorageTypes[0] : null)
                    || 'ar';
            },
            set(value) {
                this.selectedDistributionStorageChoice = value;
            }
        },
        // `registry`, when supplied, wins.
        effectiveView() {
            return this.registry ? this.worldView : this.view;
        },
        publicationRows() {
            return this.effectiveView && Array.isArray(this.effectiveView.publications) ? this.effectiveView.publications : [];
        },
        avatarRows() {
            return this.effectiveView && Array.isArray(this.effectiveView.avatars) ? this.effectiveView.avatars : [];
        },
        projectedPublications() {
            return this.publicationRows.map((row) => ({
                objectId: row.objectId,
                label: row.title,
                x: projectToCanvas(row.x),
                y: projectToCanvas(row.z)
            }));
        },
        projectedAvatars() {
            return this.avatarRows.map((row) => ({
                objectId: row.objectId,
                label: row.displayName,
                x: projectToCanvas(row.x),
                y: projectToCanvas(row.z)
            }));
        },
        // Observer-local rows, projected like `projectedPublications` but kept
        // separate: they carry no title, publisher, signature or placement data
        // (never joined to a WorldPlacement), so merging would fabricate or blank
        // those fields.
        //
        // Rows whose publicationId already has an authoritative `publicationRows`
        // entry (matched on `objectId`) are hidden, so a Publication registered
        // after being discovered doesn't render twice. This only filters the
        // rendered row: the store and any open inspection are untouched, and a
        // row reappears if its authoritative entry leaves (never "once placed,
        // forever hidden").
        projectedObserverLocalEncounters() {
            // `|| []` for test harnesses that call this computed directly via
            // `WorldEncounterCanvas.computed.projectedObserverLocalEncounters.call(ctx)`
            // without priming `ctx.publicationRows`.
            const placedPublicationIds = new Set((this.publicationRows || []).map((row) => row.objectId));
            return this.observerLocalEncounters
                .filter((encounter) => !placedPublicationIds.has(encounter.publicationId))
                .map((encounter) => ({
                    publicationId: encounter.publicationId,
                    contentHash: encounter.contentHash,
                    x: projectToCanvas(encounter.position.x),
                    y: projectToCanvas(encounter.position.z)
                }));
        },
        projectedWanderer() {
            return {
                x: projectToCanvas(this.wandererPosition.x),
                y: projectToCanvas(this.wandererPosition.z)
            };
        },
        isWorldEmpty() {
            return this.publicationRows.length === 0 && this.avatarRows.length === 0;
        },
        // describeWorldEncounterInspection() over the current selection; null with no
        // selection or when the object has left the World.
        selectedEncounterInspection() {
            return describeWorldEncounterInspection({ selectedEncounter: this.selectedEncounter, view: this.effectiveView });
        },
        // `publisherIdentity` rendered verbatim, never one cherry-picked field.
        selectedEncounterInspectionPublisherIdentityLabel() {
            if (!this.selectedEncounterInspection || this.selectedEncounterInspection.kind !== 'PUBLICATION') {
                return '';
            }
            const publisherIdentity = this.selectedEncounterInspection.publisherIdentity;
            return publisherIdentity ? JSON.stringify(publisherIdentity) : '';
        },
        // The resolved `{ kind, objectId, origin }`: automatic when RESOLVED, or the
        // Wanderer's choice when AMBIGUOUS, re-checked against the current
        // candidates on every read.
        resolvedEncounterSelection() {
            if (!this.selectionOutcome) {
                return null;
            }
            if (this.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED) {
                return this.selectionOutcome.resolvedSelection;
            }
            if (this.selectionOutcome.status === WorldEncounterSelectionOutcomeStatus.AMBIGUOUS && this.resolvedSelectionChoice) {
                const choice = this.resolvedSelectionChoice;
                const stillOffered = this.selectionOutcome.candidates.some((candidate) => (
                    candidate.kind === choice.kind && candidate.objectId === choice.objectId && candidate.origin === choice.origin
                ));
                return stillOffered ? choice : null;
            }
            return null;
        },
        // `{ kind: 'PUBLICATION', objectId: publicationId, origin }` for the
        // selected observer-local encounter, with `origin` from
        // materializedSnapshotWorldOrigin() (application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js).
        // Never routed through the registry's candidate search, which would report
        // UNAVAILABLE. Null without a selection or when the pair fails validation.
        observerLocalEncounterResolvedSelection() {
            if (!this.selectedObserverLocalEncounter) {
                return null;
            }
            const origin = materializedSnapshotWorldOrigin(
                this.selectedObserverLocalEncounter.contentHash,
                this.selectedObserverLocalEncounter.publicationId
            );
            if (!origin) {
                return null;
            }
            return Object.freeze({
                kind: 'PUBLICATION',
                objectId: this.selectedObserverLocalEncounter.publicationId,
                origin
            });
        },
        // The one gate for Open/Fork/Explore: the resolved Publication from
        // `observerLocalEncounterInspection.loading.material`, only after an
        // AVAILABLE load of a real Publication and a VERIFIED signature (the same
        // condition admitToRepositoryDiscovery() uses; this getter never calls it).
        // Null while loading or when unavailable, unverifiable or rejected, and
        // never a bare publicationId, which lacks the documentId a route needs.
        observerLocalEncounterActionablePublication() {
            if (!this.observerLocalEncounterInspection) {
                return null;
            }
            const { loading, verification } = this.observerLocalEncounterInspection;
            if (!loading || loading.status !== 'AVAILABLE' || !(loading.material instanceof Publication)) {
                return null;
            }
            if (!verification || verification.status !== 'VERIFIED') {
                return null;
            }
            return loading.material;
        },
        // The publicationId commentary uses for the observer-local selection.
        // Independent of material inspection: a core/ObserverLocalPublicationEncounter.js
        // already carries a complete publicationId, which is all the commentary
        // commands need (like PublicationCard.js's `this.publication.id`).
        observerLocalEncounterCommentaryPublicationId() {
            return this.selectedObserverLocalEncounter ? this.selectedObserverLocalEncounter.publicationId : null;
        },
        // Which source family (LOCAL, PEER or SNAPSHOT) backs the selection, joined
        // from the inspection and resolved selection (see
        // application/worldEncounter/WorldEncounterPresentation.js). Null when nothing is
        // inspectable.
        selectedEncounterPresentation() {
            return describeWorldEncounterPresentation({
                inspection: this.selectedEncounterInspection,
                resolvedSelection: this.resolvedEncounterSelection
            });
        },
        // Friendly label for the source family; 'Unresolved' when there is no
        // single resolved source yet.
        selectedEncounterPresentationSourceLabel() {
            const sourceFamily = this.selectedEncounterPresentation ? this.selectedEncounterPresentation.sourceFamily : null;
            if (sourceFamily === 'LOCAL') return 'Local';
            if (sourceFamily === 'PEER') return 'Peer';
            if (sourceFamily === 'SNAPSHOT') return 'Snapshot';
            return 'Unresolved';
        },
        // Snapshot detail for a resolved, SNAPSHOT-sourced PUBLICATION selection
        // (see application/snapshot/WorldSnapshotInspection.js); a publisher's claimed
        // position and the Snapshot's locator/storage don't reach this boundary.
        selectedEncounterSnapshotInspection() {
            return describeWorldSnapshotInspection({
                presentation: this.selectedEncounterPresentation,
                resolvedSelection: this.resolvedEncounterSelection
            });
        },
        // The resolved decentralized lead, if any, forwarded to
        // inspectWorldEncounterMaterial(). Mirrors resolvedEncounterSelection.
        resolvedLead() {
            if (!this.decentralizedLeadOutcome) {
                return null;
            }
            if (this.decentralizedLeadOutcome.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.RESOLVED) {
                return this.decentralizedLeadOutcome.resolvedLead;
            }
            if (this.decentralizedLeadOutcome.status === DecentralizedWorldEncounterLeadSelectionOutcomeStatus.AMBIGUOUS && this.resolvedLeadChoice) {
                const choice = this.resolvedLeadChoice;
                const stillOffered = this.decentralizedLeadOutcome.candidates.some((candidate) => (
                    candidate.origin === choice.origin && candidate.discoveryTag === choice.discoveryTag && candidate.uri === choice.uri
                ));
                return stillOffered ? choice : null;
            }
            return null;
        },
        // ABSENT until the lifecycle says otherwise; no new vocabulary.
        distributionMaterialState() {
            return this.distributionLifecycle ? this.distributionLifecycle.material.state : PublicationDistributionState.ABSENT;
        },
        // Material and discovery state stay independent, never one verdict.
        distributionDiscoveryState() {
            return this.distributionLifecycle ? this.distributionLifecycle.discovery.state : PublicationDistributionState.ABSENT;
        },
        // One entry per Announcement/Discovery substrate actually used, from
        // `getDiscoveryObservations()` when the store has it. Reads
        // `distributionLifecycle` only so it re-evaluates on the existing
        // subscription notification after each distribution result.
        discoveryObservations() {
            if (!this.distributionLifecycle || !this.selectedEncounter || !this.distributionLifecycleStore
                || typeof this.distributionLifecycleStore.getDiscoveryObservations !== 'function') {
                return [];
            }
            return this.distributionLifecycleStore.getDiscoveryObservations(this.selectedEncounter.objectId);
        },
        // The loaded Publication for the current selection, only when material
        // inspection loaded one AVAILABLE; never a guess or a second load.
        distributablePublication() {
            if (!this.selectedEncounter || this.selectedEncounter.kind !== 'PUBLICATION') {
                return null;
            }
            if (!this.materialInspection || !this.materialInspection.loading) {
                return null;
            }
            // A literal rather than an imported enum; see the note at the top of the
            // file.
            if (this.materialInspection.loading.status !== 'AVAILABLE') {
                return null;
            }
            return this.materialInspection.loading.material || null;
        },
        // The Material panel's "Source" fact, derived from `materialInspection`; null
        // without material.
        materialProvenance() {
            return describePublicationMaterialProvenanceFromInspection(this.materialInspection);
        },
        // Only a VERIFIED discovery result is selectable.
        isDiscoveredPublicationSelectable() {
            return !!(
                this.discoveryResult &&
                this.discoveryResult.inspection &&
                this.discoveryResult.inspection.verification.status === 'VERIFIED'
            );
        },
        // Like resolvedEncounterSelection for the comparison target, but an
        // AMBIGUOUS comparison target never resolves (deliberately excluded: no
        // second "Choose Source" panel for it).
        comparisonResolvedSelection() {
            if (!this.comparisonSelectionOutcome) {
                return null;
            }
            if (this.comparisonSelectionOutcome.status === WorldEncounterSelectionOutcomeStatus.RESOLVED) {
                return this.comparisonSelectionOutcome.resolvedSelection;
            }
            return null;
        },
        comparisonEncounterInspection() {
            return describeWorldEncounterInspection({ selectedEncounter: this.comparisonEncounter, view: this.effectiveView });
        },
        comparisonEncounterPresentation() {
            return describeWorldEncounterPresentation({
                inspection: this.comparisonEncounterInspection,
                resolvedSelection: this.comparisonResolvedSelection
            });
        },
        // "Publication A": the primary selection's comparison candidate (see
        // application/worldEncounter/WorldEncounterComparisonCandidate.js); null unless it is a
        // resolved PUBLICATION.
        selectedPublicationComparisonCandidate() {
            return describeWorldEncounterComparisonCandidate({
                presentation: this.selectedEncounterPresentation,
                resolvedSelection: this.resolvedEncounterSelection
            });
        },
        // "Publication B": the comparison target's candidate.
        comparisonPublicationComparisonCandidate() {
            return describeWorldEncounterComparisonCandidate({
                presentation: this.comparisonEncounterPresentation,
                resolvedSelection: this.comparisonResolvedSelection
            });
        },
        // compareSnapshotWorldPublications() over both candidates, recomputed on
        // every read; null until a comparison target is explicitly chosen.
        worldSnapshotComparisonResult() {
            if (!this.comparisonEncounter) {
                return null;
            }
            return compareSnapshotWorldPublications(
                this.selectedPublicationComparisonCandidate,
                this.comparisonPublicationComparisonCandidate
            );
        },
        // Content View for a Snapshot-sourced selection whose material is AVAILABLE
        // (see application/snapshot/materialization/WorldSnapshotContentView.js), recomputed on every read.
        selectedSnapshotContentView() {
            return describeWorldSnapshotContentView({
                inspection: this.selectedEncounterSnapshotInspection,
                materialInspection: this.materialInspection
            });
        },
        comparisonEncounterSnapshotInspection() {
            return describeWorldSnapshotInspection({
                presentation: this.comparisonEncounterPresentation,
                resolvedSelection: this.comparisonResolvedSelection
            });
        },
        // The comparison target's Content View, under the same conditions.
        comparisonSnapshotContentView() {
            return describeWorldSnapshotContentView({
                inspection: this.comparisonEncounterSnapshotInspection,
                materialInspection: this.comparisonMaterialInspection
            });
        },
        // Side-by-side view data from the comparison fact and both Content Views
        // (see application/snapshot/materialization/WorldSnapshotContentComparisonView.js), recomputed on
        // every read.
        worldSnapshotContentComparisonView() {
            return describeWorldSnapshotContentComparisonView({
                comparisonResult: this.worldSnapshotComparisonResult,
                contentViewA: this.selectedSnapshotContentView,
                contentViewB: this.comparisonSnapshotContentView
            });
        },
        // The publicationId commentary uses for the primary selection: the
        // encounter's own objectId, only while it is a live PUBLICATION encounter.
        // Never waits on material loading or verification.
        encounterCommentaryPublicationId() {
            if (!this.selectedEncounter || !this.selectedEncounterInspection || this.selectedEncounterInspection.kind !== 'PUBLICATION') {
                return null;
            }
            return this.selectedEncounter.objectId;
        }
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

            <div v-if="selectedEncounter" class="world-encounter-inspection-panel">
                <h4 class="world-encounter-inspection-title">World Encounter</h4>

                <dl v-if="selectedEncounterInspection && selectedEncounterInspection.kind === 'PUBLICATION'" class="world-encounter-inspection-detail">
                    <dt>Kind</dt>
                    <dd>Publication</dd>
                    <dt>Source</dt>
                    <dd class="world-encounter-inspection-source" :class="'world-encounter-inspection-source--' + selectedEncounterPresentationSourceLabel.toLowerCase()">{{ selectedEncounterPresentationSourceLabel }}</dd>
                    <dt>Title</dt>
                    <dd>{{ selectedEncounterInspection.title }}</dd>
                    <dt>Publisher</dt>
                    <dd>{{ selectedEncounterInspectionPublisherIdentityLabel }}</dd>
                    <dt>Signed</dt>
                    <dd>{{ selectedEncounterInspection.isSigned ? 'Yes' : 'No' }}</dd>
                    <dt>Position</dt>
                    <dd>{{ selectedEncounterInspection.x }}, {{ selectedEncounterInspection.y }}, {{ selectedEncounterInspection.z }}</dd>
                    <dt>Anchors</dt>
                    <dd>{{ selectedEncounterInspection.anchorCount }}</dd>
                    <dt>Placements</dt>
                    <dd>{{ selectedEncounterInspection.placementCount }}</dd>
                    <template v-if="selectedEncounterSnapshotInspection">
                        <dt>Content Hash</dt>
                        <dd class="world-encounter-inspection-content-hash">{{ selectedEncounterSnapshotInspection.contentHash || 'Unknown' }}</dd>
                    </template>
                </dl>

                <dl v-else-if="selectedEncounterInspection && selectedEncounterInspection.kind === 'AVATAR'" class="world-encounter-inspection-detail">
                    <dt>Kind</dt>
                    <dd>Avatar</dd>
                    <dt>Source</dt>
                    <dd class="world-encounter-inspection-source" :class="'world-encounter-inspection-source--' + selectedEncounterPresentationSourceLabel.toLowerCase()">{{ selectedEncounterPresentationSourceLabel }}</dd>
                    <dt>Name</dt>
                    <dd>{{ selectedEncounterInspection.displayName }}</dd>
                    <dt>Owner</dt>
                    <dd>{{ selectedEncounterInspection.ownerIdentity }}</dd>
                    <dt>Position</dt>
                    <dd>{{ selectedEncounterInspection.x }}, {{ selectedEncounterInspection.y }}, {{ selectedEncounterInspection.z }}</dd>
                </dl>

                <p v-else class="world-encounter-inspection-unavailable">
                    This encounter is no longer part of the World.
                </p>

                <div v-if="selectedEncounterSnapshotInspection" class="world-encounter-inspection-actions">
                    <button
                        type="button"
                        class="world-encounter-unregister-snapshot"
                        @click="unregisterSelectedSnapshot"
                    >Remove Snapshot from World</button>
                </div>

                <!-- Commentary for a live PUBLICATION selection. Not gated on ownership. -->
                <div v-if="encounterCommentaryPublicationId && getPublicationCommentariesCommand" class="world-encounter-commentary-panel">
                    <h4 class="world-encounter-commentary-title">Commentary</h4>

                    <button
                        type="button"
                        class="action-btn world-encounter-commentary-toggle"
                        @click="toggleEncounterCommentary"
                    >{{ encounterCommentaryOpen ? 'Hide Comments' : 'Comment' }}</button>

                    <div v-if="encounterCommentaryOpen" class="world-encounter-commentary-body">
                        <p v-if="encounterCommentaryError" class="world-encounter-commentary-error">{{ encounterCommentaryError }}</p>

                        <PublicationCommentaryRemoteCheck :publication-id="encounterCommentaryPublicationId" @refreshed="refreshEncounterCommentaries" />

                        <p v-if="!encounterCommentaries.length" class="world-encounter-commentary-empty">No commentary yet.</p>
                        <ul v-else class="world-encounter-commentary-list">
                            <li
                                v-for="commentary in encounterCommentaries"
                                :key="commentary.commentaryId"
                                class="world-encounter-commentary-entry"
                            >
                                <span class="world-encounter-commentary-author">{{ commentary.authorIdentityId }}</span>
                                <p class="world-encounter-commentary-content">{{ commentary.content }}</p>
                            </li>
                        </ul>

                        <p v-if="addPublicationCommentaryCommand && !viewerIdentityId" class="world-encounter-commentary-signin-hint">
                            Sign in to add commentary.
                        </p>
                        <form
                            v-else-if="addPublicationCommentaryCommand"
                            class="world-encounter-commentary-form"
                            @submit.prevent="submitEncounterCommentary"
                        >
                            <textarea
                                v-model="newEncounterCommentaryText"
                                class="world-encounter-commentary-input"
                                :disabled="encounterCommentarySubmitting"
                                placeholder="Add a comment…"
                            ></textarea>
                            <button
                                type="submit"
                                class="action-btn world-encounter-commentary-submit-action"
                                :disabled="!newEncounterCommentaryText.trim() || encounterCommentarySubmitting"
                            >{{ encounterCommentarySubmitting ? 'Posting…' : 'Post Comment' }}</button>
                        </form>
                    </div>
                </div>
            </div>

            <!--
                A separate inspection panel for an observer-local encounter: a
                session-local observation with no World placement, never merged into the
                World Encounter panel. Both can be open at once.
            -->
            <div v-if="selectedObserverLocalEncounter" class="world-encounter-inspection-panel world-encounter-observer-local-inspection-panel">
                <h4 class="world-encounter-inspection-title">Discovered Publication</h4>

                <!-- Answers "is it temporary?" explicitly — see this
                     milestone's own product brief, item 3: "The UI can
                     explain that... This accurately reflects the
                     session-scoped store without implying World
                     placement." -->
                <p class="world-encounter-observer-local-inspection-note">
                    This was discovered during your current World session. It has not been placed
                    anywhere in the shared World, and will not be found here again after you leave
                    or reload.
                </p>

                <dl class="world-encounter-inspection-detail">
                    <dt>Publication</dt>
                    <dd>{{ selectedObserverLocalEncounter.publicationId }}</dd>
                    <dt>Content Hash</dt>
                    <dd class="world-encounter-inspection-content-hash">{{ selectedObserverLocalEncounter.contentHash }}</dd>
                </dl>

                <!-- Same Material/Verification labels as the primary panel. -->
                <template v-if="observerLocalEncounterInspection">
                    <h4 class="world-encounter-material-title">Material</h4>
                    <dl class="world-encounter-material-detail">
                        <dt>Status</dt>
                        <dd>{{ describeMaterialLoadStatusLabel(observerLocalEncounterInspection.loading.status) }}</dd>
                    </dl>

                    <h4 class="world-encounter-verification-title">Verification</h4>
                    <dl class="world-encounter-verification-detail">
                        <dt>Status</dt>
                        <dd>{{ describeMaterialVerificationStatusLabel(observerLocalEncounterInspection.verification.status) }}</dd>
                    </dl>
                </template>
                <p v-else class="world-encounter-inspection-unavailable">
                    This publication's material could not be inspected.
                </p>

                <!--
                    Only once observerLocalEncounterActionablePublication exists (AVAILABLE +
                    VERIFIED); every action gets that resolved object. Presented with the
                    Publication's title and plain verbs; ids stay in the detail list above.
                -->
                <div v-if="observerLocalEncounterActionablePublication" class="world-encounter-observer-local-actions">
                    <h4 class="world-encounter-observer-local-actions-title">{{ observerLocalEncounterActionablePublication.title || 'This publication' }}</h4>
                    <button
                        v-if="openPublicationCommand"
                        type="button"
                        class="action-btn world-encounter-observer-local-open"
                        @click="openObserverLocalEncounterPublication"
                    >Open</button>
                    <button
                        v-if="explorePublicationCommand"
                        type="button"
                        class="action-btn world-encounter-observer-local-explore"
                        @click="exploreObserverLocalEncounterPublication"
                    >Explore</button>
                    <button
                        v-if="forkPublicationCommand"
                        type="button"
                        class="action-btn world-encounter-observer-local-fork"
                        @click="forkObserverLocalEncounterPublication"
                    >Fork</button>
                </div>

                <!--
                    Commentary for an observer-local encounter, mirroring the primary panel
                    with separate observerLocalEncounterCommentary* state (never
                    encounterCommentary*). Not gated on actionability; commentary never waits
                    on material.
                -->
                <div v-if="observerLocalEncounterCommentaryPublicationId && getPublicationCommentariesCommand" class="world-encounter-observer-local-commentary-panel">
                    <h4 class="world-encounter-observer-local-commentary-title">Commentary</h4>

                    <button
                        type="button"
                        class="action-btn world-encounter-observer-local-commentary-toggle"
                        @click="toggleObserverLocalEncounterCommentary"
                    >{{ observerLocalEncounterCommentaryOpen ? 'Hide Comments' : 'Comment' }}</button>

                    <div v-if="observerLocalEncounterCommentaryOpen" class="world-encounter-observer-local-commentary-body">
                        <p v-if="observerLocalEncounterCommentaryError" class="world-encounter-observer-local-commentary-error">{{ observerLocalEncounterCommentaryError }}</p>

                        <PublicationCommentaryRemoteCheck :publication-id="observerLocalEncounterCommentaryPublicationId" @refreshed="refreshObserverLocalEncounterCommentaries" />

                        <p v-if="!observerLocalEncounterCommentaries.length" class="world-encounter-observer-local-commentary-empty">No commentary yet.</p>
                        <ul v-else class="world-encounter-observer-local-commentary-list">
                            <li
                                v-for="commentary in observerLocalEncounterCommentaries"
                                :key="commentary.commentaryId"
                                class="world-encounter-observer-local-commentary-entry"
                            >
                                <span class="world-encounter-observer-local-commentary-author">{{ commentary.authorIdentityId }}</span>
                                <p class="world-encounter-observer-local-commentary-content">{{ commentary.content }}</p>
                            </li>
                        </ul>

                        <p v-if="addPublicationCommentaryCommand && !viewerIdentityId" class="world-encounter-observer-local-commentary-signin-hint">
                            Sign in to add commentary.
                        </p>
                        <form
                            v-else-if="addPublicationCommentaryCommand"
                            class="world-encounter-observer-local-commentary-form"
                            @submit.prevent="submitObserverLocalEncounterCommentary"
                        >
                            <textarea
                                v-model="newObserverLocalEncounterCommentaryText"
                                class="world-encounter-observer-local-commentary-input"
                                :disabled="observerLocalEncounterCommentarySubmitting"
                                placeholder="Add a comment…"
                            ></textarea>
                            <button
                                type="submit"
                                class="action-btn world-encounter-observer-local-commentary-submit-action"
                                :disabled="!newObserverLocalEncounterCommentaryText.trim() || observerLocalEncounterCommentarySubmitting"
                            >{{ observerLocalEncounterCommentarySubmitting ? 'Posting…' : 'Post Comment' }}</button>
                        </form>
                    </div>
                </div>

                <button
                    type="button"
                    class="action-btn world-encounter-observer-local-inspection-close"
                    @click="dismissObserverLocalEncounterInspection"
                >Close</button>
            </div>

            <!--
                Gated like "Remove Snapshot from World", so it only appears for a resolved
                Snapshot selection. A button while closed, the content while open.
            -->
            <div v-if="selectedEncounterSnapshotInspection" class="world-snapshot-content-view-panel">
                <h4 class="world-snapshot-content-view-title">Snapshot Content</h4>

                <template v-if="!snapshotContentViewOpen">
                    <!--
                        Only enabled when selectedSnapshotContentView exists. Opens the view
                        only; never discovers, resolves or mutates the registry.
                    -->
                    <button
                        type="button"
                        class="world-snapshot-content-view-action"
                        :disabled="!selectedSnapshotContentView"
                        @click="openSnapshotContentView"
                    >View Snapshot</button>
                </template>

                <template v-else>
                    <dl v-if="selectedSnapshotContentView" class="world-snapshot-content-view-detail">
                        <dt>Publication ID</dt>
                        <dd>{{ selectedSnapshotContentView.publicationId }}</dd>
                        <dt>Content Hash</dt>
                        <dd>{{ selectedSnapshotContentView.contentHash || 'Unknown' }}</dd>
                        <dt>Title</dt>
                        <dd>{{ selectedSnapshotContentView.material.title }}</dd>
                        <dt>Author</dt>
                        <dd>{{ selectedSnapshotContentView.material.author }}</dd>
                        <dt>Published</dt>
                        <dd>{{ selectedSnapshotContentView.material.publishedAt ? selectedSnapshotContentView.material.publishedAt.toLocaleDateString() : 'Unknown' }}</dd>
                        <template v-if="selectedSnapshotContentView.material.contentReference">
                            <dt>Content Reference</dt>
                            <dd>{{ selectedSnapshotContentView.material.contentReference.hash }}</dd>
                        </template>
                        <dt>Position</dt>
                        <dd>{{ selectedSnapshotContentView.position.x }}, {{ selectedSnapshotContentView.position.y }}, {{ selectedSnapshotContentView.position.z }}</dd>
                    </dl>
                    <!-- Material can stop being AVAILABLE while the panel is open. -->
                    <p v-else class="world-snapshot-content-view-unavailable">
                        This Snapshot's content is no longer available.
                    </p>
                    <button
                        type="button"
                        class="world-snapshot-content-view-close"
                        @click="closeSnapshotContentView"
                    >Close</button>
                </template>
            </div>

            <div v-if="selectedPublicationComparisonCandidate" class="world-snapshot-comparison-panel">
                <h4 class="world-snapshot-comparison-title">Compare</h4>

                <template v-if="!comparisonEncounter">
                    <button
                        type="button"
                        class="world-snapshot-comparison-arm"
                        :disabled="armedForComparisonSelection"
                        @click="armComparisonSelection"
                    >Compare with…</button>
                    <p v-if="armedForComparisonSelection" class="world-snapshot-comparison-hint">
                        Click another Publication marker to compare.
                    </p>
                </template>

                <template v-else>
                    <dl class="world-snapshot-comparison-detail">
                        <dt>Publication A</dt>
                        <dd>{{ selectedPublicationComparisonCandidate.publicationId }}</dd>
                        <dt>Publication B</dt>
                        <dd>{{ comparisonPublicationComparisonCandidate ? comparisonPublicationComparisonCandidate.publicationId : comparisonEncounter.objectId }}</dd>
                        <dt>Result</dt>
                        <dd class="world-snapshot-comparison-result">
                            <template v-if="!worldSnapshotComparisonResult">This comparison is no longer available.</template>
                            <template v-else-if="worldSnapshotComparisonResult.contentComparison === 'SAME_CONTENT'">Same content</template>
                            <template v-else-if="worldSnapshotComparisonResult.contentComparison === 'DIFFERENT_CONTENT'">Different content</template>
                            <template v-else>Content identity not yet known</template>
                        </dd>
                    </dl>
                    <button
                        type="button"
                        class="world-snapshot-comparison-clear"
                        @click="clearComparisonSelection"
                    >Clear comparison</button>
                </template>
            </div>

            <!--
                Appears once a comparison target is chosen; its button separately needs
                worldSnapshotContentComparisonView.
            -->
            <div v-if="comparisonEncounter" class="world-snapshot-content-comparison-panel">
                <h4 class="world-snapshot-content-comparison-title">Content Comparison</h4>

                <template v-if="!contentComparisonViewOpen">
                    <!--
                        Only enabled when both sides' material is AVAILABLE. Never mutates the
                        registry.
                    -->
                    <button
                        type="button"
                        class="world-snapshot-content-comparison-action"
                        :disabled="!worldSnapshotContentComparisonView"
                        @click="openContentComparisonView"
                    >View Content Comparison</button>
                </template>

                <template v-else>
                    <template v-if="worldSnapshotContentComparisonView">
                        <dl class="world-snapshot-content-comparison-result">
                            <dt>Content</dt>
                            <dd>
                                <template v-if="worldSnapshotContentComparisonView.contentComparison === 'SAME_CONTENT'">Same content</template>
                                <template v-else-if="worldSnapshotContentComparisonView.contentComparison === 'DIFFERENT_CONTENT'">Different content</template>
                                <template v-else>Content identity not yet known</template>
                            </dd>
                        </dl>
                        <div class="world-snapshot-content-comparison-materials">
                            <div class="world-snapshot-content-comparison-material">
                                <h5>Snapshot A</h5>
                                <dl>
                                    <dt>Publication ID</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.publicationId }}</dd>
                                    <dt>Title</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.material.title }}</dd>
                                    <dt>Author</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.material.author }}</dd>
                                    <dt>Position</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.aMaterial.position.x }}, {{ worldSnapshotContentComparisonView.aMaterial.position.y }}, {{ worldSnapshotContentComparisonView.aMaterial.position.z }}</dd>
                                </dl>
                            </div>
                            <div class="world-snapshot-content-comparison-material">
                                <h5>Snapshot B</h5>
                                <dl>
                                    <dt>Publication ID</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.publicationId }}</dd>
                                    <dt>Title</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.material.title }}</dd>
                                    <dt>Author</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.material.author }}</dd>
                                    <dt>Position</dt>
                                    <dd>{{ worldSnapshotContentComparisonView.bMaterial.position.x }}, {{ worldSnapshotContentComparisonView.bMaterial.position.y }}, {{ worldSnapshotContentComparisonView.bMaterial.position.z }}</dd>
                                </dl>
                            </div>
                        </div>
                    </template>
                    <!-- Either side's material can stop being AVAILABLE while the panel is open. -->
                    <p v-else class="world-snapshot-content-comparison-unavailable">
                        This content comparison is no longer available.
                    </p>
                    <button
                        type="button"
                        class="world-snapshot-content-comparison-close"
                        @click="closeContentComparisonView"
                    >Close</button>
                </template>
            </div>

            <div v-if="selectedEncounter && selectionOutcome && selectionOutcome.status !== 'UNAVAILABLE'" class="world-encounter-selection-origin-panel">
                <template v-if="selectionOutcome.status === 'AMBIGUOUS'">
                    <h4 class="world-encounter-selection-origin-title">Choose Source</h4>
                    <p v-if="!resolvedEncounterSelection" class="world-encounter-selection-origin-hint">
                        This encounter is offered by more than one source.
                    </p>
                    <ul class="world-encounter-selection-origin-list">
                        <li v-for="candidate in selectionOutcome.candidates" :key="candidate.origin">
                            <button
                                type="button"
                                class="world-encounter-selection-origin-choice"
                                :class="{ 'world-encounter-selection-origin-choice-active': resolvedEncounterSelection && resolvedEncounterSelection.origin === candidate.origin }"
                                @click="chooseSelectionOrigin(candidate)"
                            >{{ describeSelectionOriginLabel(candidate.origin) }}</button>
                        </li>
                    </ul>
                </template>

                <p v-else-if="selectionOutcome.status === 'RESOLVED'" class="world-encounter-selection-origin-resolved">
                    Source: {{ describeSelectionOriginLabel(selectionOutcome.resolvedSelection.origin) }}
                </p>
            </div>

            <div v-if="selectedEncounter && decentralizedLeadOutcome && decentralizedLeadOutcome.status !== 'UNAVAILABLE'" class="world-encounter-lead-panel">
                <template v-if="decentralizedLeadOutcome.status === 'AMBIGUOUS'">
                    <h4 class="world-encounter-lead-title">Choose Location</h4>
                    <p v-if="!resolvedLead" class="world-encounter-lead-hint">
                        More than one decentralized lead is currently associated with this encounter.
                    </p>
                    <ul class="world-encounter-lead-list">
                        <li v-for="candidate in decentralizedLeadOutcome.candidates" :key="candidate.origin + '|' + candidate.discoveryTag + '|' + candidate.uri">
                            <button
                                type="button"
                                class="world-encounter-lead-choice"
                                :class="{ 'world-encounter-lead-choice-active': resolvedLead && resolvedLead.origin === candidate.origin && resolvedLead.discoveryTag === candidate.discoveryTag && resolvedLead.uri === candidate.uri }"
                                @click="chooseDecentralizedLead(candidate)"
                            >{{ describeDecentralizedLeadUriLabel(candidate.uri) }}</button>
                        </li>
                    </ul>
                </template>

                <p v-else-if="decentralizedLeadOutcome.status === 'RESOLVED'" class="world-encounter-lead-resolved">
                    Location: {{ describeDecentralizedLeadUriLabel(decentralizedLeadOutcome.resolvedLead.uri) }}
                </p>
            </div>

            <!--
                Statuses go through WorldEncounterMaterialInspectionView.js labels rather
                than raw enum constants: a bare "VERIFIED" would suggest authorship or
                trust, when it only means identity correspondence to the selection.
            -->
            <div v-if="selectedEncounter && materialInspection" class="world-encounter-material-panel">
                <h4 class="world-encounter-material-title">Material</h4>
                <dl class="world-encounter-material-detail">
                    <dt>Status</dt>
                    <dd>{{ describeMaterialLoadStatusLabel(materialInspection.loading.status) }}</dd>
                </dl>

                <!--
                    Where this observation's material came from (see
                    application/publication/distribution/PublicationMaterialProvenance.js).
                -->
                <dl v-if="materialProvenance" class="world-encounter-provenance-detail">
                    <dt>Source</dt>
                    <dd>{{ materialProvenance.origin }}</dd>
                </dl>

                <h4 class="world-encounter-verification-title">Verification</h4>
                <dl class="world-encounter-verification-detail">
                    <dt>Status</dt>
                    <dd>{{ describeMaterialVerificationStatusLabel(materialInspection.verification.status) }}</dd>
                </dl>
            </div>

            <!--
                One "Distribute" trigger opens WorldDistributionDialog.js, which holds
                every distribution control. Shown when either protocol is usable.
            -->
            <button
                v-if="selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && (distributionCommand || snapshotDistributionCommand)"
                type="button"
                class="action-btn world-encounter-distribution-trigger-action"
                :disabled="!distributablePublication"
                @click="distributionDialogOpen = true"
            >Distribute</button>

            <WorldDistributionDialog
                v-if="distributionDialogOpen"
                :can-distribute-publication="Boolean(distributionCommand)"
                :can-distribute-snapshot="Boolean(snapshotDistributionCommand)"
                :has-subject="Boolean(distributablePublication)"
                :distribution-executing="distributionExecuting"
                :distribution-error="distributionError"
                :show-distribution-lifecycle="Boolean(distributionLifecycleStore)"
                :distribution-material-state="distributionMaterialState"
                :distribution-discovery-state="distributionDiscoveryState"
                :discovery-observations="discoveryObservations"
                v-model:storage="selectedDistributionStorage"
                v-model:discovery-provider="selectedDiscoveryProvider"
                :remote-pinning-draft="remotePinningDraft"
                :snapshot-distribution-storage-types="snapshotDistributionStorageTypes"
                :snapshot-distribution-executing="snapshotDistributionExecuting"
                :snapshot-distribution-error="snapshotDistributionError"
                :snapshot-distribution-result="snapshotDistributionResult"
                @close="distributionDialogOpen = false"
                @distribute-both="distributeSelectedPublicationAndSnapshot"
                @distribute-publication="distributeSelectedPublication"
                @distribute-snapshot="distributeSelectedSnapshot"
            />

            <!--
                Snapshot discovery/attribution: separate from Snapshot Distribution
                because they are different questions about the same Publication. Only
                with a discoverSnapshotCommand.
            -->
            <div v-if="selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && discoverSnapshotCommand" class="world-encounter-snapshot-discovery-panel">
                <h4 class="world-encounter-snapshot-discovery-title">Snapshot Discovery</h4>

                <!-- Disabled with nothing to discover or while a call is in flight. -->
                <button
                    type="button"
                    class="action-btn world-encounter-snapshot-discovery-action"
                    :disabled="!distributablePublication || snapshotDiscoveryExecuting"
                    @click="discoverSelectedSnapshot"
                >{{ snapshotDiscoveryExecuting ? 'Discovering…' : 'Discover Snapshot' }}</button>

                <!--
                    Outcome rendered through SnapshotOutcomeInspectionView.js's label, not the
                    raw string.
                -->
                <p v-if="snapshotDiscoveryError" class="world-encounter-snapshot-discovery-error">{{ snapshotDiscoveryError }}</p>
                <dl v-else-if="snapshotDiscoveryResult" class="world-encounter-snapshot-discovery-detail">
                    <dt>Outcome</dt>
                    <dd>{{ describeSnapshotResolutionLabel(snapshotDiscoveryResult.outcome) }}</dd>
                    <template v-if="snapshotDiscoveryResult.reason">
                        <dt>Reason</dt>
                        <dd>{{ snapshotDiscoveryResult.reason }}</dd>
                    </template>
                    <template v-if="snapshotDiscoveryResult.locator">
                        <dt>Locator</dt>
                        <dd>{{ snapshotDiscoveryResult.locator }}</dd>
                    </template>
                </dl>

                <!--
                    Attribution result, separate from discovery (see
                    application/snapshot/SnapshotPublicationAttribution.js). Rendered as "Confirmed to
                    match this Publication" rather than a bare "match": the identical wording
                    and narrow meaning (a content-hash correspondence, not authorship or
                    trust) as the Material/Verification panel (see docs/Principles.md).
                -->
                <dl v-if="snapshotAttributionResult" class="world-encounter-snapshot-attribution-detail">
                    <dt>Snapshot Attribution</dt>
                    <dd>{{ describeSnapshotAttributionLabel(snapshotAttributionResult.outcome) }}</dd>
                </dl>
            </div>

            <!-- Popup trigger, gated on discoveryCommand like the panel inside. -->
            <button
                v-if="discoveryCommand"
                type="button"
                class="action-btn world-encounter-publication-discovery-trigger"
                @click="publicationDiscoveryOpen = true"
            >Publication Discovery</button>

            <div
                v-if="publicationDiscoveryOpen"
                class="modal-overlay world-encounter-publication-discovery-overlay"
                @click.self="publicationDiscoveryOpen = false"
            >
                <div class="modal-panel world-encounter-publication-discovery-modal">
                    <h3>Publication Discovery</h3>

                    <!--
                        Independent of selectedEncounter: a discovered Publication is never a marker. Uses
                        the same Material/Verification classes as the selection panel.
                    -->
                    <div v-if="discoveryCommand" class="world-encounter-discovery-panel">
                        <h4 class="world-encounter-discovery-title">Discover Publication</h4>
                        <input v-model="discoveryObjectId" placeholder="Publication id" :disabled="discovering" />
                        <input v-model="discoveryTag" placeholder="Discovery tag" :disabled="discovering" />
                        <button
                            type="button"
                            class="action-btn world-encounter-discovery-action"
                            :disabled="discovering"
                            @click="discoverPublication"
                        >{{ discovering ? 'Discovering…' : 'Discover Publication' }}</button>

                        <p v-if="discoveryError" class="world-encounter-discovery-error">{{ discoveryError }}</p>
                        <template v-else-if="discoveryResult">
                            <!--
                                resolution.status (UNAVAILABLE/RESOLVED/AMBIGUOUS) stays raw: plain
                                technical tokens in their own existing vocabulary, with no humanizer to
                                route through.
                            -->
                            <dl class="world-encounter-discovery-detail">
                                <dt>Discovery</dt>
                                <dd>{{ discoveryResult.resolution.status }}</dd>
                            </dl>

                            <!--
                                Same status label methods as the selection panel, so this panel can never
                                state a stronger verification claim for the same fact.
                            -->
                            <template v-if="discoveryResult.inspection">
                                <h4 class="world-encounter-material-title">Material</h4>
                                <dl class="world-encounter-material-detail">
                                    <dt>Status</dt>
                                    <dd>{{ describeMaterialLoadStatusLabel(discoveryResult.inspection.loading.status) }}</dd>
                                </dl>

                                <!--
                                    Provenance computed by
                                    application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js
                                    and rendered verbatim.
                                -->
                                <dl v-if="discoveryResult.provenance" class="world-encounter-provenance-detail">
                                    <dt>Source</dt>
                                    <dd>{{ discoveryResult.provenance.origin }}</dd>
                                </dl>

                                <h4 class="world-encounter-verification-title">Verification</h4>
                                <dl class="world-encounter-verification-detail">
                                    <dt>Status</dt>
                                    <dd>{{ describeMaterialVerificationStatusLabel(discoveryResult.inspection.verification.status) }}</dd>
                                </dl>

                                <!-- Shown only when isDiscoveredPublicationSelectable. -->
                                <button
                                    v-if="isDiscoveredPublicationSelectable"
                                    type="button"
                                    class="action-btn world-encounter-discovery-selection-action"
                                    @click="selectDiscoveredPublication"
                                >Select Publication</button>
                            </template>
                        </template>
                    </div>

                    <!--
                        Shown for as long as a selection exists, whatever the panel above now
                        shows.
                    -->
                    <div v-if="selectedDiscoveredPublication" class="world-encounter-discovered-selection-panel">
                        <p class="world-encounter-discovered-selection-notice">Selected discovered publication.</p>
                    </div>

                    <button
                        type="button"
                        class="action-btn world-encounter-publication-discovery-close"
                        @click="publicationDiscoveryOpen = false"
                    >Close</button>
                </div>
            </div>
        </div>
    `
};
