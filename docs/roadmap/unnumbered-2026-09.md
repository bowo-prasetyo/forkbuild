# Roadmap: unnumbered work, September 2026

## Distribution, network settings and wallets (unnumbered, 2026-09-20 to 2026-09-23)

**Publications page layout.** The tools disclosure is split into three tabs (Blockchain Anchoring, Archive Tools,
References & Achievements); each entry's Details disclosure is split into four (Snapshot, Decentralization &
Evidence, Placements & IPFS, History); each entry's Distribution section is a disclosure that starts open. All
presentation only.

**World View Snapshot distribution.** `distributeWorldEncounterSnapshot()` read a Publication's bytes from
`LocalPublicationCatalog`, which never holds World Publications, so it failed for nearly every real click. It now
reads `publicationContentStore.get(publication.contentReference)`; the same fix went into the Publications page.
World View gained a storage picker (Arweave, IPFS (Local Kubo), IPFS (Remote Pinning)); Remote Pinning publishes
through `ipfsRemotePublicationCoordinator` and announces through the Snapshot discovery publisher, returning the
same result shape. Failures in both World View panels now go through `sanitizeDistributionErrorMessage()`. A Nostr
announcement failure after a successful pin is kept as `result.announcementError` and never fails the pin.

**One Nostr relay set, with fan-out.** `core/NostrRelayConfiguration.js` accepts `relayUrls` (a list). New
`NostrMultiRelaySnapshotDiscoveryPublisher`, `NostrMultiRelaySnapshotDiscoveryQueryService`,
`NostrMultiRelayPlaceNamingDiscoverySource` and `NostrMultiRelayPublicationCommentaryDistribution` query and publish
across every relay. Relays are independent stores, so this is fan-out, not ordered failover (the Arweave/IPFS
gateway rule). Snapshot announcements had been hardcoded to `wss://relay.damus.io`; they now use the configured set.
The separate "Nostr Publication Relays" configuration (`core/NostrPublicationRelaySetConfiguration.js`, its store,
use case, provider and settings page) was removed and merged into this one set, reversing the earlier decision to
keep them apart. Later, the Set use cases for Arweave Gateway, IPFS Gateway and Nostr Relays accept only the list
form.

**Nostr or Arweave for every announcement.** New `application/placeNaming/ArweavePlaceNamingDiscoveryPublisher.js`; the Snapshot
and Place Naming runtime compositions take `discoveryProvider: 'nostr' | 'arweave'`, like Publication distribution.
A new settings page, `/settings/announcement-discovery-provider`, stores the default for Publication, Snapshot, Place
Naming and Commentary. `ui/main.js` builds both Snapshot discovery publishers and exposes
`resolveSnapshotDiscoveryPublisher(discoveryProvider)`, so Snapshot distribution also has a per-click override.

**Proof & Anchoring preference.** `application/anchoring/PreferredPublicationAnchorCreationCoordinator.js` (plus its
composition use case) resolves the stored `PROOF_AND_ANCHORING` preference. A new `/settings/anchor-provider` page
and a "Use Preferred Provider" button in the Publication Center use it. Base is excluded (it needs a reviewed wallet
transaction), so the preference is Bitcoin or Arweave. A later fix returned `preferredAnchorCreationCoordinator`
from the Publications page's `setup()`; the button had never actually rendered.

**More endpoints are configurable.** `core/IpfsNodeConfiguration.js` (+ store and use case) sets the Kubo API URL for
the IPFS write path, edited on the Content Provider page (previously always `127.0.0.1:5001`).
`core/BitcoinEsploraConfiguration.js` (+ store, use case and `/settings/bitcoin-esplora`) sets the Esplora endpoint
used for broadcast, confirmation, funding lookups and proof verification. Both follow the Arweave/IPFS Gateway
pattern.

**Saved preferences seed every picker.** `application/settings/SavedProviderDefaultChoice.js`
(`resolveSavedProviderDefault()`) picks the saved provider as a picker's initial value only when it is one of the
options offered; otherwise the old default stands. It only seeds the first value and never overrides a choice
already made. It is used by the Editor, Publications, Repository and both World View distribution surfaces.
`OwnPublicationPanel` also gained the Nostr/Arweave selector it was missing (it always used Nostr).

**Remote Pinning as the Content default.** Content Provider settings can save `remote-pinning`, and the composition
root and every distribution dialog accept it. `local` is no longer offered, because content always stays on this
device first: `PreferredSnapshotPlacementCreationCoordinator#preferableStorageTypes()` excludes it, and a legacy saved
`local` reads as no preference.

**Remote-pinning credential memory.** `application/ipfs/IpfsRemotePublishingCredentialMemory.js` keeps the last saved
pinning credential in a module-scope variable for the tab's lifetime only (no browser storage), so a new entry's
form can be prefilled without breaking the 0.8.68 ephemeral-credential rule.

**Wallet timeouts.** NIP-07 `getPublicKey()`/`signEvent()` now time out after 2 minutes, and
`NostrPublicationDiscoveryPublisher`'s outer timeout went from 8s to 250s, so a slow nos2x approval is no longer
abandoned early. The Arweave, Bitcoin (UniSat) and Base (EIP-1193) signers got the same 120s bound on their
connect/sign calls.

**One Distribute action.** World Encounters, My Publication and the Editor's post-publish overlay each gained one
"Distribute" button that runs Publication and Snapshot distribution in sequence, never concurrently: both legs can
sign through the same wallet extension, which can hang if asked twice at once. EditorView also gained Distribute
Snapshot. The dialogs (0.9.672) later got one shared settings block (Storage, one Remote Pinning draft, one
Announcement/Discovery substrate) read by both legs; results and errors stay per protocol. When Snapshot
distribution is available, Storage lists only the backends the Snapshot registry reports, plus Remote Pinning.

**Settings page code.** Every settings page uses the 560px card layout. The shared form lifecycle moved into
`ui/composables/useEndpointSettingsForm.js` and `ui/composables/useRoleProviderPreferenceForm.js`, and the "one URL
per line" parser into `utils/splitNonEmptyLines.js`. The never-visible `'saving'` status was removed.

## World View, vehicles and wildlife (unnumbered, 2026-09-21 to 2026-09-23)

**Tree species.** `core/NaturalFeatureField.js#TREE_SPECIES` (CONIFER/BROADLEAF/SCRUB) is chosen from the moisture
field: grassland fringe trees are SCRUB, and forest splits into wetter CONIFER and drier BROADLEAF with a narrow blend
band. `renderer/NaturalFeatureTileMesh.js` builds one instanced trunk/canopy pair per species present in a tile.

**Lighting.** Instanced tree and animal colors rendered almost black: the materials set `vertexColors: true` on
geometry with no color attribute. `renderer/Lights.js` also replaced its ambient light with a `HemisphereLight` and
raised both intensities for `MeshStandardMaterial`.

**Wildlife collision.** `core/WildlifeCollisionGeometry.js` (deer 0.5, rabbit 0.3 base radius, scaled per animal),
`core/AvatarWildlifeCollisionQuery.js` and `application/avatar/AvatarWildlifeConstraint.js` (reusing
`core/AvatarTreeMovement.js`'s circle resolution). The constraint runs after tree collision as a sixth optional
constraint. It blocks walking, not riding.

**Double elevation fix.** A mounted vehicle's domain position already carries real terrain height, so the render
lift was adding it twice (sinking into valleys, floating over hills). `syncVehicles()` now renders the vehicle as is,
and the avatar render path skips its own lift while riding (`ridingVehicle`, `_isRidingMovableVehicle()`).

**Drones fly.** `core/AvatarDroneVerticalState.js` (GROUNDED/RISING/HOVERING/DESCENDING, `DRONE_HOVER_ALTITUDE = 4`,
`stepDroneAltitude()`). Drones are placed (`VEHICLE_TYPE_DRONE_SHARE = 0.02`, the rarest type), rendered
(`buildDrone()`), mountable, and movable as a real `AERIAL_VEHICLE` (speed 16). A drone can't be dismounted while
meaningfully above the ground. Tree collision is skipped only while HOVERING. Building collision became
height-aware for free by passing the drone's real Y into `core/AvatarCollision.js`. Ground vehicles now read
BICYCLE 6 < MOTORCYCLE 9 < CAR 12 < DRONE 16.

**Map, compass and styles.** The compass updates during an orbit drag. The `<style>` block `WorldView.js` injected at
load is gone (it duplicated `css/main.css`). The map reads `getMapContent()` only while it is open.

**World Encounter locations.** `application/worldEncounter/WorldEncounterLeadAssociationsQueryComposition.js` supplies real
lead-association evidence to `WorldEncounterCanvas` through a new `leadAssociationsQuery` prop. The
`decentralizedLeadAssociations` array had never been passed in production, so every outcome was UNAVAILABLE and the
Choose Location panel never appeared. One local-only publication provider is now shared by encounter discovery and
this query.

## Editor, Commentary and cleanup passes (unnumbered, 2026-09-22 to 2026-09-23)

**Brick colors.** Each brick type's default color moved from `renderer/ThreeBrickFactory.js` onto
`BrickDefinition#color`. `core/Brick.js` gained an optional per-instance `color` (0xRRGGBB, `null` = the
definition's color), set with the undoable `SetBrickColorCommand`. There is a swatch in the Build Library (for the
next bricks placed) and one in the Selection Inspector (to recolor the selection). `core/ColorHex.js` converts to
and from CSS hex. `WorldRenderer#_onBrickUpdated` now also applies the color.

**Commentary fetch-on-open.** `application/publication/commentary/RefreshPublicationCommentaryCommandComposition.js` checks Nostr and
Arweave side by side for one Publication and returns `{ newCount, checked, failed }`; it never rejects.
`ui/components/PublicationCommentaryRemoteCheck.js` runs it when a Commentary section opens and from a "Check for new
comments" button. It is mounted in every Commentary section. This answers 0.9.628's "when to fetch" question.
Comments posted from World View's panels are still only saved locally.

**Shared Commentary section.** `ui/components/PublicationCommentarySection.js` replaces the Repository card and
list views' two drifting copies. The list view also now honors the saved Announcement/Discovery default.

**Coding conventions.** `utils/sortOptionsByLabel.js`: choice lists are sorted alphabetically by label unless the
order carries meaning. Comments explain why, and change history belongs here, not in code. See
`docs/CodingConventions.md`.

**Identity security.** `LocalIdentityProvider#exportLocalIdentity()` now counts wrong passphrases against the same
per-identity lockout as unlock (`_decryptWithAttemptLimit()`), so Export can no longer be used to guess without a
cooldown. `IdentityUseCase.declareSuccessor()` now also publishes `VaultLockChanged`. Passphrase fields use
`autocomplete="new-password"`.

**Peers and Conversations.** `ConnectedPeerRegistry#connectedSince()` and `PeerSessionManager#isPublishing()` make
the connection timer and the "Be Discoverable" state app-wide instead of per page visit. "Open Chat" is gated on
`chatUseCase.canChat()`, so a blocked friend gets none. `PeerPresenceUseCase#list()` reads each store once, and
`onChange()` no longer passes a list.

**My Worlds.** One damaged `world-experience:*` entry no longer breaks the page:
`LocalWorldExperienceStore#getExperience()` treats it as never visited, and `LocalWorldExperience` validates
`lastVisitedAt` and camera values.

**My Avatar.** Component controls come from the template's declared components. The two visibility sections share
`ui/components/VisibilityPolicyForm.js`.

**Dead code removed.** Each pass kept behavior and updated the source-pinning tests:

- Editor: `replayRecoveredOperation()` and its wiring; `EditorContext`'s camera state and `CAMERA_STATE_CHANGED`;
  `DocumentState.readOnly`; `ui/components/GroupsPanel.js`; `application/TransformSelectionUseCase.js` (superseded by
  `SpatialEditingService`); `InputRouter`'s `ESCAPE_PRIORITY`/`resolveEscapeTarget()` (EditorView implements the Escape
  chain itself); `EditorActionRegistry`'s `capabilities.canEdit` gate, the `ui.promptCreateStructure()` fallback and
  `getByCategory()`; `EditorSession#getSelectionCount()`/`snapSelectionToGrid()`; the unused key-up/wheel dispatch
  chain. The Toolbar requires `feedback` (no `alert()` fallback).
- World View: an unused handler and refs, all 29 `typeof session.x === 'function'` guards, and duplicate focus
  handlers.
- Repository: `PublicationPage.empty()`, `PublicationQuery.withPage()` and the unused `forkCounts` prop.
  `License.idOf()` gives one "UNSPECIFIED" fallback.
- My Worlds: `getRecentlyVisitedWorlds()` and `LocalWorldExperienceStore#updateCamera*()`.
- My Avatar: `onPolicyChanged()` on both visibility use cases.
- My Identities: `IdentityUseCase` `login()`, `logout()`, `protectIdentity()`, `vaultLock()`, `isRevoked()`,
  `getRevocationRecord()` (the provider methods remain); `onRemoteLifecycleChanged()`. The per-identity forms were
  collapsed into one open form at a time.
- Peers: `PeerSessionManager#listCandidates()`/`forgetCandidate()`; the `lifecycleState` summary field.
- Publications page: a third of the file's comments (version history) removed; five unused `isValid*State` exports.

## Code-size cleanup (unnumbered, 2026-09-24)

**Shared SHA-256.** `core/Sha256.js` (`sha256()`, `sha256Hex()`) replaces five identical hand-written copies in
`application/publication/observationArchive/PublicationObservationArchiveFingerprint.js`, `application/achievement/AchievementEvidenceFingerprint.js`,
`application/leaderboard/snapshot/Fingerprint.js`,
`application/claimSnapshotReconciliation/PlanIdentity.js` and
`anchoring/BitcoinAnchorSignedPsbtFinalizer.js`. It stays synchronous (`crypto.subtle.digest()` is Promise-only) and
dependency-free. Fingerprints are unchanged; the plan-identity boundary test now allows exactly this one import.

**Shared helpers.** Local copies of four small helpers now come from `utils/`: `isNonEmptyString()` and
`isPlainObject()` (`utils/typeGuards.js`), `parseJSONOrNull()` (`utils/parseJsonOrNull.js`) and `withTimeout()`
(`utils/withTimeout.js`, which takes the timeout message as a third argument so each caller keeps its own). This
removed 61 definitions across 55 files. The eight validators whose copy trimmed whitespace now call
`isNonBlankString()`, so both behaviors are kept. Five source-pinning tests that counted imports or `setTimeout()`
calls now allow the `utils/` helpers.

**Milestone history out of comments.** Per docs/CodingConventions.md (comments explain why; history lives here),
the comments in the sixteen most comment-heavy files were rewritten to describe the current design without
milestone tags, "AMENDED BY" notes or superseded reasoning. Line counts: `ui/components/WorldEncounterCanvas.js`
6424 → 2464, `application/world/WorldNavigationSession.js` 8053 → 5573, `ui/views/WorldView.js` 5906 → 3477,
`ui/main.js` 3596 → 1278, `ui/components/OwnPublicationPanel.js` 3513 → 1130, `ui/views/EditorView.js` 2649 →
1781, `application/publication/observationArchive/PublicationObservationArchive.js` 2205 → 1159, `application/editor/EditorSession.js` 1963 → 1420,
`application/chat/VoiceUseCase.js` 1489 → 854, `application/avatar/AvatarMovementController.js` 1424 → 406,
`application/chat/ChatUseCase.js` 1179 → 630, `application/avatar/AvatarVehicleInteractionController.js` 1011 → 432,
`core/AvatarVehicleMovementCapability.js` 854 → 200, `application/world/CreateWorldViewUseCase.js` 826 → 390,
`application/publication/distribution/PublicationDistributionLifecycleStore.js` 681 → 145 and
`application/avatar/AvatarVehicleMovementController.js` 628 → 219. No code changed. Phrases that source-pinning tests quote
were kept. Tests that used a version-tagged comment as an anchor now anchor on code or on the current comment text
(the `document lifecycle` divider, `4.1. `, the Nearby Place Names `CollapsibleSection`, the Arweave snapshot store
construction, and the WorldEncounterCanvas observer-local header). Three assertions that only checked that a comment
still said something the code no longer does were dropped or reduced to existence checks
(ArweaveAnnouncementDiscoveryCapabilityBoundaryAudit B2, ArweaveAnnouncementDiscoveryIntegrationBoundaryAudit I6/I7).

**Large views split into composables.** `ui/views/DecentralizedPublicationsView.js` (7,547 → 4,389 lines) and
`ui/views/WorldView.js` (3,478 → 2,275 lines) keep their templates, but most of each `setup()` now lives in
per-feature composables under `ui/views/decentralizedPublications/` (fifteen composables plus the shared
`presentation.js` badge/label constants) and `ui/views/worldView/` (eleven composables). Each composable takes its
collaborators as explicit arguments and returns its state and actions; `setup()` destructures them, so the names
the template reads are unchanged. The split was mechanical and verified three ways: every free identifier in the
moved code still resolves, every name the template reads is still returned from `setup()`, and a server-side render
of each view (logged out, stubbed injections) produces byte-identical HTML before and after. Source-reading tests
now read each view together with its modules through `tests/support/ViewSourceFiles.js`; a handful of function-body
regexes were adjusted for the composables' indentation, and three single-file checks now accept the view's own
modules.

**WorldNavigationSession split by concern.** `application/world/WorldNavigationSession.js` (5,573 → 1,805 lines) keeps
its constructor, lifecycle (`start()`, `dispose()`), frame-loop setup, navigation, selection and streaming. Its
other 210 methods now live in ten modules under `application/worldNavigation/`: local avatar, avatar presence,
place queries, world experience, collaboration, placements, fork-on-write, World content, place naming and document
history. `installMethods()` puts them on the prototype as ordinary non-enumerable methods, so the class's public
shape, `this` and `instanceof` are unchanged; defining a name twice throws. Verified by snapshotting every prototype
member (name, flags and source text) before and after: all 264 are identical. Source-reading tests read the class
with its modules through `tests/support/SourceFileGroups.js` (renamed from `ViewSourceFiles.js`); three checks that
it imports exactly one CommandHistory class now count distinct modules rather than import statements.

**Stylesheet split into parts.** `css/main.css` (6,436 lines) is now an entry point that `@import`s eleven parts
under `css/main/` (app shell, editor, repository and account, World View, World navigation panels, spatial
panels, tools and settings, identity/publications/peers, World map and places, publication evidence, World
encounters and history; 108–789 lines each). The parts are contiguous slices of the old file imported in their
original order, so the cascade is unchanged: joined back together they match the old file line for line, and
Chromium parses the old and new stylesheets into the same 877 rules in the same order. `index.html` is untouched.
The nine source-reading tests that read `css/main.css` now read its parts through `stylesheetFiles()` in
`tests/support/SourceFileGroups.js`.

**Publications template split into sections.** `ui/views/DecentralizedPublicationsView.js` (4,389 → 1,188 lines)
keeps the page's outer template, but its largest sections now live as template strings in nine modules under
`ui/views/decentralizedPublications/templates/`: the three tools tabs (Blockchain Anchoring, Archive Tools,
References & Achievements) and, per publication, the Distribution section and the Snapshot, Evidence and
Placements tabs (the Evidence tab further split into its anchor transaction plans and per-anchor evidence list).
They are interpolated back into `template`, so they render in the view's own scope with no new props or
components. The assembled template string is identical to the old one (269,631 characters), and the rendered
Publications page (DOM and every element's computed style, disclosures open) is identical before and after.
`publicationsPageFiles()` now includes the template sections after the view, and
`publicationsViewSourceWithTemplate()` returns the view with its sections expanded for checks that span the whole
template. Eighteen tests that read the view file alone now read it through one of these.

**WorldEncounterCanvas methods split by concern.** `ui/components/WorldEncounterCanvas.js` (2,464 → 1,708 lines)
keeps its props, data, computed properties, lifecycle hooks and template, plus `selectEncounter()` and
`refreshWorldViewFromRegistry()`. Its other 43 methods live in five modules under
`ui/components/worldEncounterCanvas/` (observer-local encounters; selection outcomes and their labels; material
inspection, repository admission and distribution; snapshot content views and comparison; publication discovery
and commentary), spread into `methods`. The label helpers moved with the methods that use them. Comparing the
component before and after: all 45 methods have the same source text apart from indentation, and props, data,
computed properties and the template are unchanged.

**WorldView and EditorView `setup()` split further.** `ui/views/WorldView.js` (2,275 → 1,951 lines) moves five
more concerns into `ui/views/worldView/`: viewport input, Home and Locations, Editor hand-off, document actions and
World presence sync. `ui/views/EditorView.js` (1,781 → 1,030 lines) moves five into a new `ui/views/editorView/`:
post-publish distribution, selection actions, the structure library, blueprint export and import, and structure
inspection. They follow the existing composable convention. Presence sync keeps its subscription bookkeeping
private and exposes `syncCurrentWorldSpatialPresence()` (the 100 ms interval) and `disposeWorldPresence()`
(teardown); that is the only change beyond moving code. EditorView's tab-indented section now uses spaces.
`refreshSpatialUI()` stays in WorldView: it reads 44 of the view's names. Each moved group was checked with a scope
analysis: every name it reads is passed in or imported, every name the rest of `setup()` uses is returned, no `let`
is shared across the boundary, and no composable runs before its inputs exist. The names `setup()` returns, the
templates and the component lists are unchanged, and ESLint's `no-undef`/`no-unused-vars` report nothing new
(WorldView's nine pre-existing unused destructured names remain). In Chromium, the Editor and a World View render
identical DOM and computed styles before and after, including after pointer, keyboard and button interaction
(with marker positions masked, since they vary from run to run).

**Tests read split files as groups.** Source-reading tests now read each split file through its group in
`tests/support/SourceFileGroups.js`, including tests that still passed reading the file alone, so checks that code
never does something keep covering the moved code. Other adjustments: method regexes that expected eight-space
indentation (moved methods now sit at four), inventories that list files (they now name the module holding the
code), and relative import paths quoted from source.

**More shared helpers.** 102 identical local copies of 17 small helpers across 64 files now come from shared
modules: `lerp()`/`smoothstep()` (`utils/interpolation.js`), `isFiniteCoordinate()`/`isFiniteXZPosition()`
(`core/FiniteCoordinates.js`), `responseContentLength()`/`byteLength()` (`utils/responseSize.js`),
`bytesToHex()`/`hexToBytes()`/`concatBytes()`/`reverseBytes()` for the Bitcoin and Base codecs (`utils/bytes.js`;
`identity/Ed25519.js` keeps its stricter versions), `hasOnlyKeys()` (`utils/typeGuards.js`), `normalizeRelayUrls()`
(`application/nostr/NostrRelayUrls.js`), and, in `application/claimSnapshotReconciliation/`, `candidateIdentityKey()`
(`CandidateIdentityKey.js`), `isGenuineDecision()`/`canonicalDecisionKey()` (`decision/DecisionRecord.js`) and
`isGenuineObservation()`/`canonicalObservationKey()` (`revalidationObservation/ObservationRecord.js`). The
reconciliation helpers are import-free leaf modules, so the views that use them still import no plan or discovery
code. Copies whose bodies differ were left alone. Source-pinning tests that count import lines now skip these
shared-helper imports, through `tests/support/SharedHelperImports.js`.

**EditorSession and WorldNavigationSession split further.** `application/editor/EditorSession.js` (1,420 → 465
lines) keeps its constructor, lifecycle, context queries and gizmo presentation. Its other 60 methods live in five
modules under a new `application/editorSession/`: selection editing, transforms, clipboard and groups, structures
and blueprints, and pointer input. `application/world/WorldNavigationSession.js` (1,805 → 791 lines) keeps its
constructor, `start()`, runtime setup and `dispose()`. Its other 64 methods live in five more modules under
`application/worldNavigation/`: navigation, selection, state queries, World streaming, and document operations.
`installMethods()` moved to `utils/installMethods.js`, since both classes use it now. Section headers the earlier
split left behind (Local World Experience, Fork-on-write, World Location Browser) now head the modules that hold
those methods. Leading tabs in `WorldNavigationSession.js` and three of its modules are now spaces. Verified by
snapshotting every prototype member (name, flags and source text) before and after: all 82 EditorSession and 264
WorldNavigationSession members are identical, as are both constructors. Tests that read either class's source now
read it with its modules through `tests/support/SourceFileGroups.js` (129 reads in 85 files). 35 of those tests
had been failing because they read only `WorldNavigationSession.js` after the earlier split; they pass now.

**WorldEncounterCanvas and OwnPublicationPanel split further.** `ui/components/WorldEncounterCanvas.js` (1,708 → 715
lines) moves its 36 computed properties into four modules under `ui/components/worldEncounterCanvas/` (canvas
projection, selection and inspection, distribution, snapshot comparison) spread into `computed`, and five template
sections into `ui/components/worldEncounterCanvas/templates/`. `ui/components/OwnPublicationPanel.js` (1,130 → 413
lines) moves 17 of its methods into two modules under a new `ui/components/ownPublicationPanel/` (publication actions,
the Snapshot diagnostic pipeline) and four template sections into its `templates/`. Module-level helpers moved with
the only code that uses them. Comparing each component definition before and after: the compiled template string is
identical, and so is the source of every prop, computed property, method, watcher and lifecycle hook, apart from
indentation. Tests read OwnPublicationPanel with its modules through `tests/support/SourceFileGroups.js` (186 reads in
103 files); checks on template order read `ownPublicationPanelSource()` or `worldEncounterCanvasSource()`, which
expand the template in place. Other adjustments follow the earlier splits: inventories name the module holding the
code, method regexes expect four-space indentation, and import paths quoted from source gained a `../`.

**WorldView template split further.** `ui/views/WorldView.js` (1,399 → 1,237 lines) moves three more template
sections into `ui/views/worldView/templates/`: the header and actions, the World lists, and the navigation HUD. The
expanded template (`worldViewSourceWithTemplate()`) is identical before and after. `setup()` is left as it is: what
remains is refs, injections, composable wiring, `refreshSpatialUI()` and the returned names, and the one cohesive
block left (the automatic Snapshot cascade, its retention reconciliation and the place-naming monitor) shares two
`let` flags with `refreshSpatialUI()` and unmount, so extracting it would change code rather than move it.

**Composition root split by subsystem.** `ui/main.js` (1,278 → 453 lines, 198 → 37 imports) calls seven compose
functions in a new `ui/main/`: identity and peers, content and Snapshots, anchoring, World discovery, injected-wallet
services, publication distribution, and Snapshot discovery. Each is a contiguous block of the old file moved
verbatim into a function, called at the same point, taking the earlier bindings it reads and returning the ones later
code uses, so evaluation order is unchanged. A scope analysis confirmed no block assigns an outer binding or has one
assigned from outside, and no hoisted function is used before its block. The Publication and Commentary wiring stays
in `ui/main.js`, because two late-assigned `let` bindings connect it to the injected-wallet services. Every
`app.provide()` call stays in `ui/main.js`, directly after the compose call that returns its value. Loading the app
in Chromium before and after gives identical results: all 119 provided values (constructor, member names and
normalized function source), console output, and the rendered home page and nine routes. Tests read the root with
its compose functions through `mainFiles()` (267 reads in 168 files); inventories that named `ui/main.js` now name
the compose function holding the code, and checks that only the composition root may read
`window.arweaveWallet`/`window.nostr` count `ui/main/` as part of it. Two unused bindings the old file already had
(`resolvedIpfsGatewayUrl`, `resolvedNostrRelayUrl`) moved unchanged.

**Leaderboard claim and snapshot files grouped into folders.** The 30 `application/leaderboard/` files that repeated
the folder's own name (up to 72 characters) now live in `leaderboard/claim/` (the claim record, history and their
views), `leaderboard/claimSnapshot/` (claim–snapshot association, correspondence and divergence views) and
`leaderboard/snapshot/` (the snapshot, its fingerprint, verification and exchange, and the snapshot-claim use cases),
with the `PublisherLeaderboard` prefix dropped. `PublisherLeaderboardView.js` and `PublisherRankingPolicy.js` stay
where they are. The four `ui/components/ReconciliationCandidate*` components moved to `ui/components/reconciliation/`
the same way. Exported identifiers are unchanged. Imports, source paths in tests, comments and docs name the new
paths; the two leaderboard family-census tests count the new folders (the family is now 83 files, since the folders
also hold six claim files the prefix never matched). The Bitcoin and Base anchoring folders keep their names, since
each file there is named after the class it exports.

**Shared test helpers.** Five helpers that test files each defined for themselves now come from `tests/support/`:
`assert()` (`Assert.js`, 992 files), `InMemoryStorageProvider` (`InMemoryStorageProvider.js`, 608),
`makeIdentity()` (`TestIdentity.js`, 165), the one-line source readers `readSource()`/`rawSource()`/`source()`
(`SourceText.js`, 363 copies; files keep their local names through `import { readSource as rawSource }`) and
`serialize()` (`Serialize.js`, 100). Only copies whose text matched the shared version exactly were replaced; the
comment describing a removed copy went with it, and imports and `SOURCE_ROOT` constants that only it used were
dropped. The counting `assert()` and `n()` stay in each file, since the browser runner loads every test into one
page and a shared counter would accumulate across files. 1,115 test files lose about 10,700 lines.

**A test suite that runs, passes and gates changes.** Before this change 156 of the 1,119 test files failed under
Node (144 already failed at the oldest commit in this clone), `tests.html` listed seven files that no longer
existed and left out twenty that did, and nothing ran the tests automatically. Most failures were not defects:
they were checks on source text (a string or regex matched against a file, an import count, a file-name census),
on git state (`git status`/`git diff` expected clean, or `git show` of an old commit), or on another test file
still passing, and they broke whenever code was moved or reworded.

- 327 test files were removed. 318 of the 348 files named as audits, reassessments, gates, baselines or closures
  went outright. The other 30 each covered production lines no other test did (measured with V8 line coverage):
  27 stayed with their text-only sections taken out, one (`AvatarInventory`) only matched the naming pattern, and
  two went after their behaviour checks moved to a new test or turned out to come from re-running since-deleted
  files. Seven more files that executed no production code at all went too. `ProductIntegrityBoundaryHardening` (which edited `core/CausalStamp.js` on disk mid-run) became
  `tests/LayerBoundaries.test.js`, which reads real import statements: `core/` imports nothing from `application/`,
  `renderer/` or `ui/`, and `renderer/` nothing from `application/` or `ui/`. The behaviour checks of one closure
  audit moved to `tests/FailureOutcomeLabels.test.js`.
- In the tests that stayed, source-text and git-state assertions were removed, tests that sliced a function out of
  a view with a regex now mount the real composable (`usePostPublishDistribution`), and tests that had drifted from
  current APIs were corrected: an empty `CommandRegistry`, `MoveStructurePlacementCommand`'s `delta`, the world's
  `placements` key, remembering the wrong side of a peer connection, listening for a call's end only after
  hanging up, and the array shape of post-publish distribution results. Vocabulary checks over leaderboard
  claims and snapshots now look at field names, not at random signatures and did:key values that can contain
  "xp" or "tier" by chance.
- One product bug was found and fixed: `WebRtcPeerConnection` passed the remote side a `null` stream because
  `addAudioTrack()` sends a bare track, so a voice call could show as connected while `ChatView`'s `<audio>`
  element had nothing to play. The remote track is now wrapped in its own `MediaStream`.
- Line coverage of production code measured under Node went from 56,954 to 57,392 lines. The lines no longer
  covered are mostly the voice use case, which is now tested in Chromium (not measured). Two modules lost the only
  tests that reached them and got focused ones: `tests/SnapshotDistributionContentBackendSelection.test.js`, and
  every resolution outcome's label in `tests/FailureOutcomeLabels.test.js`. The third,
  `application/publication/PublicationAuthorNameIdentityConvergence.js` (the "several identities publish under
  this name" notice), is imported by no production file, so it has no test until something uses it.
- A revoked identity's new connection attempt is now checked for what matters: it never authenticates (its own
  handshake fails at once, the other side's times out). Creating the invitation itself still succeeds, without an
  identity hint.

How tests run now: `npm test` (Node 22). `tests/run.mjs` runs every file in its own process, in parallel, with
`tests/support/NodePreload.mjs` supplying Vue (the existing shim) and WebRTC (`node-datachannel`); files that open
real peer connections run one at a time afterwards, with local ICE candidates only (no external STUN server).
`tests/support/RunTestFile.mjs` ends a test's process once nothing can run again, because libdatachannel's threads
can otherwise keep it alive after the test has passed; it exits the way Node would have, 13 included for a
top-level `await` that never settled.
The four voice tests need Web Audio and media tracks, start with `// @environment browser`, and run in headless
Chromium through `tests/run-browser.mjs`. `tests.html` is gone. `.github/workflows/tests.yml` runs the Node tests,
the rendezvous worker's tests and the browser tests on every pull request and on pushes to `main`. Testing rules
are in docs/CodingConventions.md.

**Key handling on audited and platform cryptography.** Identity keys were signed by a hand-written, BigInt Ed25519
and SHA-512 (not constant-time and never reviewed), protected by a home-made cipher with 600 PBKDF2 iterations,
stored unencrypted unless the user typed an optional passphrase, and generated with a silent `Math.random` fallback
when no secure random source existed.

- `identity/Ed25519.js` keeps its API but delegates to noble-curves 2.4.0 and noble-hashes 2.4.0 (noble-curves was
  audited by Trail of Bits at 2.3.0; 2.4.0 adds hardening on top). Their ES modules are copied into `vendor/` by
  `scripts/vendor.mjs`, which only rewrites the package-name imports into relative paths so the browser and
  Node load the same files; `tests/IdentityCryptography.test.js` fails if `vendor/` differs from the pinned npm
  packages. Verification is strict RFC 8032 (non-canonical S and small-order keys are rejected), and signatures
  interoperate with WebCrypto's Ed25519 in both directions. `randomSeed()` throws when `crypto.getRandomValues` is
  missing.
- `identity/KeyEncryption.js` uses WebCrypto: PBKDF2-HMAC-SHA256 with 600,000 iterations and AES-256-GCM, records
  refusing more than 10,000,000 iterations. Legacy records still decrypt (with the same primitives, through WebCrypto)
  and are re-encrypted in the current format on the next successful unlock or export; a fixture written by the old
  code (`tests/fixtures/legacy-identity-key-encryption.json`) proves both a stored key and a version 1 export file
  still open. Identity export files are now `formatVersion: 2`; import accepts 1 and 2.
- Because WebCrypto is asynchronous, the operations that derive a key are too: `createProtectedLocalIdentity()` (new),
  `protectIdentity()`, `unlock()`, `changePassphrase()`, export and import. Everything else stays synchronous:
  `createLocalIdentity()` and `login()` create unprotected identities and now refuse a passphrase instead of taking
  one; `authenticate()`, `declareSuccessor()`, `revokeIdentity()` and the device grants require a protected identity
  to be unlocked first. `IdentityUseCase` keeps the UI's one-call shape (it unlocks with the given passphrase when
  the identity is locked) and publishes the lock state once per action.
- Passphrases are the default. New passphrases (creating, protecting, changing, and exporting an unprotected
  identity) need at least 8 characters. The login dialog and My Identities ask for a passphrase and its
  confirmation, explain that there is no reset, and create an unprotected identity only after the user ticks
  "Create without a passphrase". Unprotected identities are marked ⚠ Unprotected in My Identities, which gains a
  Protect with Passphrase action (the provider supported it; no UI offered it). Actions that derive a key show
  progress. An end-to-end run in Chromium covered the opt-out, a protected identity signing a publication, unlocking
  after a reload, protecting an existing identity and unlocking a legacy key, which was upgraded in storage.

**Scripts served from the app's own origin, under a Content Security Policy.** The page loaded Vue, Vue Router,
`@vue/devtools-api` and Three.js from unpkg with no integrity check, so whoever controlled that CDN (or the path to
it) could run code with access to every identity key the page unlocks.

- `scripts/vendor-noble.mjs` became `scripts/vendor.mjs`, which also copies Vue 3.4.31 (the full browser build,
  since templates compile in the browser), Vue Router 4.4.5, `@vue/devtools-api` 6.6.4 and Three.js 0.160.0 (the
  module build and `OrbitControls`) into `vendor/`, byte for byte, with each package's license and version. The
  versions are the ones the CDN URLs named, now pinned exactly in `package.json`. `index.html`'s import map and the
  browser test runner point at `vendor/`, and the app works offline.
- `index.html` carries a Content Security Policy: scripts only from the app's origin plus the import map by hash
  (`'unsafe-eval'` remains for Vue's template compiler), styles and fonts only from the origin, no objects, frames,
  workers, `<base>` or form submissions. `connect-src` allows any HTTPS/WSS endpoint, because relays, gateways and
  APIs are user-configurable, and plain HTTP only to localhost (the IPFS node).
- `tests/VendoredLibraries.test.js` replaces the vendor check in `tests/IdentityCryptography.test.js` and covers every
  package; `tests/ContentSecurityPolicy.test.js` checks the import map's hash, the directives, and that every
  import-map entry is a vendored file.
- New `docs/Deployment.md`: hosting requirements, how to upgrade a vendored library, the policy directive by
  directive, and the response headers a host should add (`frame-ancestors`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`).
- In Chromium with every request to another host blocked, all routes render with no policy violations, and the
  end-to-end run (creating a protected identity, building, saving, publishing and the Repository's thumbnails)
  passes; an injected inline script and a script from another origin are both refused.
- CI: `tests/UserConfigurableRendezvousConfiguration.test.js` sent a real lookup to the default rendezvous server.
  Offline that failed at once; on GitHub's runners it connected, and the open socket kept the test's process
  alive until the runner's timeout. The test now uses its fake WebSocket, and `tests/support/NodePreload.mjs`
  makes WebSocket and fetch to any host but this machine fail immediately in every Node test.

