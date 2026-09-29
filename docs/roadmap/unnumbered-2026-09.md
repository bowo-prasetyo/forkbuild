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

**Rendezvous server: signed changes and limits.** The reference server in `server/rendezvous-worker/` authenticated
no one: anyone could overwrite any identity's entry, withdraw it with a publication id anyone can look up, set an
expiry decades away, and fill its storage.

- PUBLISH now requires the publication to be signed by the identity it names. Identity ids are `did:key`s, so the
  server verifies each signature against the id itself (WebCrypto Ed25519, over the same canonical envelope the app
  signs) and needs no accounts. The app already signed publications whenever it could; a locked identity is now told
  to unlock instead of publishing unsigned.
- REMOVE carries the identity's signature over withdrawing that one publication: a new `rendezvous-removal` signature
  type (`core/RendezvousPublicationEnvelope.js#getRendezvousRemovalSigningDescriptor`), produced by
  `peer/RendezvousPublicationSigning.js#signRendezvousRemoval` and sent by `RendezvousDiscoveryProvider.unpublish()`.
- The server refuses a publication older than the stored one (no rollback to an old endpoint) and keeps a withdrawn
  entry as a tombstone until it expires (a withdrawn publication cannot be replayed).
- Limits: 32 KB messages, publications lasting at most 15 minutes and dated at most 5 minutes ahead, 120-request
  bursts then 2 per second per connection, 16 connections per IP address, and 100,000 stored identities
  (`MAX_ENTRIES`). The entry count is kept in storage and recounted by the sweep alarm.
- Tests: `server/rendezvous-worker/worker.test.js` now uses real Ed25519 identities and covers forgery, tampering,
  replay, withdrawal, every limit and the connection cap; the new `tests/RendezvousWorkerInterop.test.js` runs the
  app's own client classes against the worker through an in-memory WebSocket.
- Not done here: the default server is still one personal `workers.dev` deployment. Running more than one server
  (the app already publishes to and looks up on every configured URL) is an operations task for the release.

**TURN credentials: no key in the app, and no request on page load.** `peer/IceServerConfig.js` held a Metered API
key and `ui/main` fetched TURN credentials with it in the background on every page load: every visitor, signed in or
not, contacted `forkbuild.metered.live`, and anyone could read the key and spend the account's relay quota.

- The key and the Metered endpoint are gone from the app. The rendezvous worker gains `GET /turn-credentials`: with
  `METERED_DOMAIN` and the `METERED_SECRET_KEY` secret set, it creates a Metered credential that expires after an
  hour and returns its ICE servers (`{ iceServers, expiresAt }`), answering each IP address at most 20 times an hour.
  Without those settings it answers 404.
- The app asks for credentials only when a connection starts: `WebRtcPeerConnectionProvider` takes a `turnIceServers`
  source and `prepareIceServers()`, which `PeerSessionManager` awaits before `createInvitation()`,
  `acceptInvitation()` and `connectToDiscovered()`. The source (`createTurnCredentialSource()`) asks the configured
  rendezvous servers (`wss://host` → `https://host/turn-credentials`), caches the credential until five minutes
  before it expires (a failure for ten minutes), shares concurrent requests, and degrades to STUN (plus any user TURN
  entry) within 5 seconds.
- Tests: `tests/IceServerConfig.test.js` is rewritten for the new source and hook, including that constructing the
  provider requests nothing; the worker tests cover the endpoint, its rate limit, CORS and that the secret key never
  appears in a response. Source-text assertions on the old background fetch were removed, as was
  `TurnWebRtcIntegration`'s Section J, which re-ran other test files as child processes.
- Operator action: the old key was public in this repository's history, so it must be rotated in the Metered
  dashboard, and the worker redeployed with the new settings.

**Editing while signed out, and a full browser storage.**

- Every brick placed while signed out (or with a locked identity) threw an uncaught error: the Editor's and World
  View's command propagation handlers (`DocumentCommandPropagationUseCase`, `WorldCommandPropagationUseCase`) tried
  to broadcast each local edit and threw because no identity could sign it. With no identity there is also no
  authenticated peer to send to, so the handlers now skip broadcasting and the edit stays local.
  `tests/SignedOutEditingPropagation.test.js` covers both, signed out and locked.
- Full storage: `LocalStorageProvider.save()` turns each engine's quota error into `StorageFullError`
  (`storage/StorageFullError.js`), whose message is fit to show (World View already shows error messages). The Editor's
  save failure says storage is full and points to Export instead of "Try again", which cannot help
  (`ui/components/saveFailureMessages.js`). The autosave timer no longer throws: `AutosaveScheduler` takes an
  `onError`, and the Editor reports a paused crash recovery once until a save succeeds. These messages stay up for 10
  seconds. `tests/StorageFullHandling.test.js` covers them; in Chromium, with storage filled, placing a brick and
  pressing Ctrl+S showed both messages and no uncaught error.
- Getting Started now explains the crash-recovery copy, the storage limit, and that building needs no login.- `tests/AvatarCollision.test.js` failed about one run in seven: its wall was placed at a hash of a random
  publication id, so it landed on different procedural terrain, water and trees each run. It is now placed at a
  fixed spot (0 failures in 30 runs).

**Release preparation for 1.0.**

- The advanced areas are marked **Experimental**: routes carry `meta: { experimental: true }`
  (`/publications`, the leaderboard, reconciliation and publisher snapshot claim pages, and the anchoring and
  Bitcoin settings), and `ui/components/ExperimentalBanner.js` is shown above each of them. The Publications link
  and the two settings rows carry an Experimental badge. Nothing was removed.
- New documents: `SECURITY.md` (private reporting through GitHub, scope), `CONTRIBUTING.md`, `docs/Privacy.md`
  (what is stored, and every server the app can contact and when) and `docs/ReleaseNotes-1.0.md` (a draft: the app
  still reports 0.9.703 until the release is tagged).
- Getting Started no longer says to open `index.html` from disk, and marks Publications experimental; the README
  lists the experimental areas and no longer says there is no central server, since the default setup uses a
  rendezvous server.
- The top navigation's links no longer break across lines, and wrap as whole links on narrow windows.

**TURN relay from Cloudflare.** Metered's free tier refuses to create credentials through its API (the rendezvous
worker's `/turn-credentials` answered 400, "not available with the Free Tier"), so the worker gains Cloudflare
Realtime TURN: with the `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` secrets it asks
`rtc.live.cloudflare.com` for ICE servers with an hour-long credential, dropping port-53 entries, which browsers
block. Cloudflare is used when both providers are configured. Every provider now counts against a monthly allowance
(`TURN_CREDENTIALS_PER_MONTH`, default 10,000); past it the endpoint answers 503 and the app connects without a relay.
A failing provider's 502 names the step and status, with the key blanked; if Metered's credential listing fails, the
new credential is used with Metered's standard relay addresses. `wrangler.toml` no longer sets `METERED_DOMAIN`.

**1.0.0 (2026-09-25).** The version moves from 0.9.703 to 1.0.0 (`core/version.js`, shown on the About page, and
`package.json`), and `docs/ReleaseNotes-1.0.md` is no longer a draft. The release is tagged `v1.0.0`.

**Watching the relay allowance.** The rendezvous worker gains `GET /turn-stats` (this month's credential count, the
allowance and the provider; counts only, so it skips the origin check and opens in a browser), logs a warning at 80%
of `TURN_CREDENTIALS_PER_MONTH` and on every request refused past it, and `wrangler.toml` enables `[observability]`
so those logs are kept and searchable in the Cloudflare dashboard.


## Local storage in IndexedDB (unnumbered, 2026-09-25)

**Documents, chat history and everything else local now live in IndexedDB.** localStorage gives each site about
5 MB, which is why the storage-full handling above was needed. Every store already went through the synchronous
`StorageProvider`, and its 63 callers rely on getting an answer immediately, which IndexedDB cannot give. So instead of making the
whole app asynchronous, `storage/LocalStorageProvider.js` now keeps its JSON strings in a pluggable backend, and
`storage/IndexedDbStorageBackend.js` is one: it reads the whole database into memory once at startup, answers reads
from memory, and commits writes in the background, one relaxed transaction per task. No store or use case changed.

- `ui/boot.js` is the new page entry point: it opens storage (`storage/openBrowserStorage.js`) and only then imports
  `ui/main.js`, so no module can read storage before it is ready. If IndexedDB is missing or does not open within
  10 seconds, the session keeps using localStorage.
- On open, any `forkbuild:` entries in localStorage are moved into IndexedDB (replacing the same names) and then
  removed from localStorage, so existing data carries over, and so does anything saved during a localStorage session.
- Save (Toolbar button and Ctrl/Cmd+S, through `ui/components/saveDocument.js`) waits for `flushLocalStorage()`,
  which commits with strict durability, so "Saved" means stored and a full storage is still reported with
  `StorageFullError`; the document is then marked unsaved again. The first flush asks the browser for persistent
  storage (`navigator.storage.persist()`), so data is not evicted under disk pressure.
- A failed background write stays in memory and is retried with the next commit; `onWriteError()` reports it.
- Tabs: after a commit the written names are broadcast on the `forkbuild-storage` BroadcastChannel and other tabs
  read those entries back from IndexedDB. Reading, rather than taking the values from the message, keeps each tab's
  copy equal to disk, because IndexedDB orders transactions and messages can arrive in any order. Entries a tab has
  written and not yet stored are left alone.
- Tests: `tests/IndexedDbStorageBackend.test.js` (batching, durability, failures and retry, tabs, Save, fallback,
  against a fake database) and `tests/IndexedDbStorageBackendBrowser.test.js` (real IndexedDB in Chromium:
  reopening, moving localStorage data in, a 12 MB entry, two tabs). In Chromium the app starts as before, moves an
  existing localStorage entry into IndexedDB, and Ctrl+S stores the document and its manifest in IndexedDB.
- Not changed: the whole dataset stays in memory, which suits the tens of megabytes this app keeps. If published
  content (`content:`, `snapshot:`) grows into hundreds of megabytes, those stores should read IndexedDB
  asynchronously instead.

## Instanced brick rendering (unnumbered, 2026-09-25)

**Bricks are drawn as instances, not one mesh each.** WorldRenderer used to give every brick its own `THREE.Mesh`,
`BoxGeometry` and material: one draw call per brick, which made builds of tens of thousands of bricks unusable (a
hollow 233×233 pyramid is 54,289 bricks). `renderer/BrickInstanceRegistry.js` replaces `renderer/MeshRegistry.js`:
bricks of the same definition within the same 16-unit cube of space share one `InstancedMesh` (a chunk), with one
material for every chunk and one geometry per definition.

- Per instance: its transform, its color (`instanceColor` over a white material) and a highlight: an
  `instanceEmissive` attribute that the material's shader (`onBeforeCompile`) adds to its emissive light, so selection
  looks exactly as `material.emissive` did. A chunk starts at 64 instances and doubles when full; removing a brick
  moves the chunk's last instance into its slot. Chunks are spatial so frustum culling and the raycaster's
  bounding-sphere test skip whole regions.
- The registry maps brick id → document and building, and answers what picking, selection and presence outlines ask
  (`brickIdForIntersection()`, `getPosition()`, `getBounds()`, `setHighlight()`, `forEachPosition()`).
  `WorldRenderer#brickInstances` replaces `#meshRegistry`; `PickingService`, `SelectionRenderer`,
  `SpatialSelectionRenderer` and `RemoteSpatialPresenceRenderer` use it. A picked face's normal now includes the
  instance's rotation.
- `BrickRenderer#describe()` gives a brick's definition, transform and resolved color; `ThreeBrickFactory` builds
  geometry on its own (`createGeometry()`), and still builds standalone meshes for structure placements, previews and
  thumbnails, which are unchanged.
- Tests: `tests/BrickInstanceRegistry.test.js` (batching, growth, removal, moves across chunks, WorldRenderer events,
  picking with rotated instances, marquee, highlights, presence outlines) and
  `tests/BrickInstanceRenderingBrowser.test.js` (real WebGL: each instance's color and highlight on screen). Seven
  tests that built fake per-brick meshes now use the registry.
- Measured in headless Chromium on the hollow pyramid (54,289 cubes, whole pyramid in view): draw calls 54,289 → 316,
  JavaScript time per `render()` 386 ms → 2.2 ms, building the scene 1.4 s → 0.16 s, JS heap 819 MB → 29 MB, one pick
  16 ms → 2.6 ms. The solid pyramid (2,135,445 cubes), impossible before, takes 680 draw calls, 5 ms of JavaScript
  per frame, 9.7 s to build and 813 MB of heap. Frame times there are dominated by software rasterization (no GPU),
  so they say nothing about a real GPU. In the Editor, the pyramid opens and a clicked brick glows exactly as before
  (pixel-identical screenshot).
- Not changed: every brick is drawn, including ones hidden inside a solid build, so a solid pyramid still sends about
  25 million triangles per frame to the GPU; skipping bricks enclosed on all six sides is the natural next step.
  Structure placements are still one mesh per brick.

## Sharing large builds (unnumbered, 2026-09-25)

**Large content moves between peers in parts, and large Snapshots are routed to IPFS.** A build's bytes leave a
device three ways: the peer `forkbuild:content` protocol (publication content by hash), the peer
`forkbuild:snapshot-content-transfer` protocol (Snapshot materialization), and Snapshot distribution to Arweave or
IPFS. The two peer protocols refused anything over 48 KB (about 350 bricks), and Arweave took at most 256 KiB. The
other 48 KB limits (World Encounter material, publication material, discovery envelopes) apply to the signed
publication record, never to a build, so they stay.

- `application/peer/ChunkedPeerTransfer.js`: content too large for one RESPONSE goes as `RESPONSE_PART` messages, each
  part's JSON-escaped text at most 60 KiB, so every message fits the 64 KiB peer message limit whatever the content
  escapes to. The sender pauses while the data channel holds more than 1 MiB (`PeerConnection#bufferedAmount`, new). The
  receiver (`PartAssembler`) takes parts in any order, ignores duplicates, and accepts parts only for content it
  requested (`OutstandingRequests`), at most 64 MiB per transfer and two transfers at once, dropping one idle for 30 s;
  the joined content is hash-checked exactly like a RESPONSE. Content that fits is still one RESPONSE, and older peers
  ignore the new kind. See docs/Protocol.md, "Large content in parts".
- Both exchanges report `onTransferProgress()`, and `PeerContentRetrievalCoordinator` and
  `MaterializeSnapshotFromPeerUseCase` restart their 8 s wait on each part, so the timeout bounds silence rather than
  the whole transfer.
- `ContentStore#maxContentBytes` (Infinity unless a store sets one): the Arweave stores take it from the signer's new
  `maxDataBytes` (the injected wallet signer signs single-chunk transactions, 256 KiB). `executeSnapshotDistributionCommand`
  refuses a larger build before anything is signed or uploaded, with `ContentTooLargeError`: "This build is 7.4 MB, more
  than the 256 KB Arweave storage accepts. Choose IPFS storage to distribute it." IPFS has no limit.
- IPFS uploads (local node, remote pinning) get one more second of timeout per 128 KiB (`utils/uploadTimeout.js`), so
  a multi-megabyte upload over a slow connection is not cut off; smaller uploads keep their timeouts.
- Tests: `tests/ChunkedPeerTransfer.test.js` (splitting, validation, reassembly bounds, send-buffer waiting, both
  exchanges over an authenticated connection, unsolicited and forged parts, timeouts restarting on progress, Arweave
  refusal and store limits) and `tests/ChunkedPeerTransferWebRtc.test.js`: the hollow 233-base pyramid (54,289 bricks,
  7.4 MB) crosses a real WebRTC data channel in 141 parts in 0.4 s (on one machine), send buffer peaking at 330 KiB, and
  arrives verified.
- Not changed: Arweave storage still means one single-chunk transaction; multi-chunk Arweave uploads (and bundling) are
  unimplemented, so large builds go to IPFS or directly to peers.

## Compact document format (unnumbered, 2026-09-25)

**Document schema 2 stores bricks as a table, and new bricks get short ids.** Of the 136 bytes a brick took in a
stored or published document, 36 were its UUID and most of the rest repeated property names. The hollow 233-base
pyramid was 7.49 MB.

- `core/BrickTable.js`: each building's bricks are one `brickTable`: `definitions` and `colors` palettes in first-use
  order, `ids`, and six numbers per brick (definition index, x, y, z, rotation, color index or 0). Bricks keep their
  order, so the form is canonical and content hashes stay meaningful. `Building`/`World#toJSON({ compactBricks })`
  write it and `Document#toJSON()` asks for it; `Building.fromJSON()` reads either form; `World#toJSON()` without the
  option is unchanged for in-memory uses (forking, command history).
- `DOCUMENT_SCHEMA_VERSION` is 2. The schema 1 → 2 migration turns each `bricks` array into a table and changes
  nothing else, ids included; schema 0 documents migrate through it too. `DocumentValidator` checks the table, naming
  the brick and field at fault. A published schema 1 snapshot keeps its bytes and still verifies. An app older than
  this one refuses schema 2 documents as newer than it supports.
- `createBrickId()`: new bricks, and a fork's copied bricks, get 12 random characters from `[0-9A-Za-z]` (71 bits;
  about a one-in-a-billion chance of any collision in a two-million-brick document) instead of a 36-character UUID.
- Hollow pyramid: 7.49 MB → 3.09 MB for an existing document (UUIDs kept), 1.79 MB built new (4.2× smaller); the solid
  pyramid 290 MB → 70 MB. Serializing it takes 7 ms instead of about 85, stringifying 10 ms instead of 80.
- Autosave and Save no longer parse the previous checkpoint to learn its revision: `LocalRecoveryStore` keeps a small
  `recovery-info:{documentId}` record (`RecoveryStore#loadRevision()`), and falls back to the checkpoint for ones
  written before it. Save no longer parses the checkpoint twice. An autosave of the hollow pyramid (median of repeated
  runs, storage writing JSON text) takes 28 ms for a new build and 37 ms for one with UUIDs, instead of 119–135 ms.
- Tests: `tests/CompactDocumentFormat.test.js` (codec, validation, short ids, canonical round trip, schema 0/1
  migration with UUIDs and groups, old snapshots verifying, forks, sizes, revision reads); twelve tests that read
  stored bricks directly now go through `tests/support/StoredDocumentBricks.js`, and the historical fixtures gain
  `SCHEMA_1_DOCUMENT` next to a schema 2 `CURRENT_DOCUMENT`. In the browser, a schema 1 document written the old way
  opens in the Editor and is saved back as schema 2.
- Not done: autosave still writes the whole document. At hollow-pyramid scale that is now cheap; a change-only
  checkpoint (a base plus a journal of brick changes, compacted from time to time) would matter only near the solid
  pyramid's scale, where saving, loading and memory are all limits anyway.

## Published copies stay on disk (unnumbered, 2026-09-25)

**Published content and snapshots are no longer held in memory.** The IndexedDB backend read every entry into memory
at startup. Publishing a build stores it three times (the editable document, `snapshot:{publicationId}` and
`content:{hash}`), and every publication received from peers adds a `content:` entry, so memory and startup grew with
everything ever published or seen: three published hollow pyramids were 16.4 MB, all resident.

- `IndexedDbStorageBackend`: entries under `COLD_KEY_PREFIXES` (`content:`, `snapshot:`) are cold. `open()` reads
  every name but only non-cold values (key ranges around the cold prefixes); a cold write stays in memory until stored,
  then moves to a warm cache (16 M characters, most recently used first, the latest value always kept); `loadItem()`
  reads one asynchronously (concurrent reads of one entry share a read); `hasItem()`, `keys()` and `isLoaded()` answer
  without reading. A synchronous `getItem()` of a cold entry not in memory throws `StorageEntryNotLoadedError`
  (`storage/StorageEntryNotLoadedError.js`) rather than returning null, which would read as "not stored". Other tabs'
  cold writes update the index and drop the warm copy; entries moved from localStorage are cold too.
- `LocalStorageProvider#load()` rethrows that error with `ready`, a promise already reading the entry (a failed read
  never surfaces as an unhandled rejection); `loadAsync()` and `exists()` are new on `StorageProvider`.
  `retryWhenLoaded(read)` runs a synchronous reader from async code, waiting for each entry it finds on disk.
- `LocalContentStore#get()` is asynchronous, like every other ContentStore; `has()` checks existence without reading;
  `getSync()` serves World View. The four UI distribution paths that read it synchronously now await it;
  `CreateExternalSnapshotPlacementUseCase` reads through `retryWhenLoaded()`.
- World View streaming stays synchronous (the rule `tests/WorldLifecycleIdentityProductReassessment.test.js` pins): a
  world whose published content is still on disk is skipped without counting as a failed load, and the next periodic
  `updateSpatialView()` loads it.
- Measured in Chromium with three published hollow pyramids: 16.41 MB stored, 5.36 MB held in memory after a restart
  (the three editable documents); opening the database took 15 ms. The Editor opens them as before.
- Tests: `tests/ColdStorageBrowser.test.js` (real IndexedDB: names without values at open, reading on demand, the
  bounded cache, cold writes, removal, two tabs, content moved from localStorage, and a published World loading
  through `LoadPublishedWorldSessionUseCase` once read) and `tests/StreamingColdContent.test.js`.
- Not changed: editable documents stay in memory, since about twenty places read them synchronously (collision and
  selection against placed structures, World View streaming, search, catalogs, the Editor). Keeping them on disk too
  means making those reads asynchronous, a larger change of its own.

## Steem announcement substrate proposed (unnumbered, 2026-09-25)

**A written proposal for Steem as a third Announcement/Discovery substrate, before any code.** Nostr relays may drop
events, and Arweave charges per post. Steem blocks become irreversible within about a minute, which gives
announcements a durable, ordered and timestamped place at no per-post fee.

- `docs/Protocol.md`, "Proposed: Steem Announcement Substrate": announcements are replies to monthly discovery
  threads (`@forkbuild/forkbuild-<family>-<YYYY-MM>`), not top-level posts, so they stay out of Steem tag feeds.
  Threads rotate monthly because `get_content_replies` has no paging. Threads and announcements decline payout and
  turn votes off in the same transaction, so announcements can't be downvoted. Signing goes through Steem Keychain.
  The existing envelopes are carried unchanged and verified by the existing verifiers. Readers accept direct replies
  only, ignore votes and reputation, and read configurable thread accounts and API nodes.
- "Discovery thread", not "anchor", because PublicationAnchor already means anchoring evidence.
- `docs/Publishing.md` points to the proposal.
- Not done: no code yet. The `@forkbuild` account exists; its threads have not been created.

## Steem discovery thread page (unnumbered, 2026-09-25)

**An operator page that creates the monthly Steem discovery threads.** The threads must exist before anyone can
announce, at least twelve months ahead. Posting 52 of them by hand, five minutes apart, each with votes off in the
same transaction, is error-prone, and steemit.com's editor cannot turn votes off at all.

- `core/SteemDiscoveryThread.js`: families, `YYYY-MM` periods, permlinks, the thread post and its `comment` +
  `comment_options` operations, and `checkSteemDiscoveryThreadContent()` for what `get_content` returns (author,
  root post, category, declined payout, votes and curation off, replies on, metadata). The app will reuse it when
  announcing and reading are built.
- `steem/SteemRpcClient.js` (condenser_api calls with API node failover; a chain error is never retried on another
  node) and `steem/SteemKeychainBroadcaster.js` (Keychain holds the key; ForkBuild never sees it).
- `scripts/steem-threads/`: check, preview the operations, and create the missing threads. It waits for the chain's
  root-post interval from the account's `last_root_post` and from its own last post, re-checks each thread just
  before posting, confirms each on the chain, and stops at the first refusal, unconfirmed post or wrong thread.
- Tests: `tests/SteemDiscoveryThread.test.js`, `tests/SteemRpcClient.test.js`, `tests/SteemKeychainBroadcaster.test.js`
  and `tests/SteemThreadCreation.test.js` (a fake chain and clock: pacing, skipping, stopping). The page was also
  driven in Chromium against a mocked API node and a fake Keychain.

## Steem announcements decline payout, votes stay on (unnumbered, 2026-09-26)

**Threads and announcements now only decline payout; they no longer turn votes and curation off.** Creating the
first thread failed with Steem Keychain's "Posting key is incorrect" although the key was right. Tests on
`@forkbuild` narrowed it down: a custom_json, a plain post, and a reply with its `comment_options` declining payout
all signed and broadcast, while the same reply with `allow_votes` and `allow_curation_rewards` false failed inside
Keychain before anything was broadcast. Keychain cannot sign options that turn votes off.

- `core/SteemDiscoveryThread.js`: `comment_options` sends `allow_votes: true` and `allow_curation_rewards: true`,
  and the thread check no longer requires votes to be off (a thread with them off still passes). The thread text
  says votes don't change whether an announcement is accepted.
- `docs/Protocol.md`: the thread and announcement options, and why votes stay on. With payout declined a vote moves
  no rewards, so there is little reason to downvote, and readers ignore votes anyway.
- The thread page links the repository's favicon.
- Also learned: a test post was upvoted within minutes, after which the chain refused to change its options
  (`comment.abs_rshares == 0`). Sending the options in the post's own transaction, as the page does, is required.

## Reading Steem announcements (unnumbered, 2026-09-26)

**ForkBuild now reads Publications, Snapshots, Place Naming claims and Commentary from the Steem discovery threads.**
The four September 2026 threads exist on the chain, so readers can find announcements as soon as anyone replies;
announcing from the app comes next.

- `core/SteemDiscoveryAnnouncement.js`: reads one reply's shape (direct reply to the thread, `forkbuild.version` 1,
  the thread's family, an object envelope) and nothing more; the envelope is checked by its family.
- `application/steem/SteemDiscoveryThreadReader.js`: reads one family from every thread account's monthly threads,
  from the first configured month (default 2026-09) to now, at most 36 months, four requests at a time. It keeps
  the newest 2,000 replies per thread, caches earlier months for 10 minutes and the current month for 30 seconds, and reports found, empty or
  unavailable; one failed thread never hides the others. `steem/SteemRpcClient.js` gains `getContentReplies()`.
- One adapter per family, each matching the existing Nostr/Arweave shape: `SteemPublicationDiscoveryQueryService`
  (leads for the World discovery registry), `SteemSnapshotDiscoveryQueryService` (joins the snapshot candidate
  search, with `searchWithOutcome()`), `SteemPlaceNamingDiscoverySource` (one thread for all regions, so it keeps only
  envelopes whose world and region derive the requested tag) and `PublicationCommentarySteemDistribution` (read by
  a new substrate-neutral `DiscoverPublicationCommentaryUseCase` and added to "Check for new comments").
- Settings: `core/SteemReadingConfiguration.js`, `storage/SteemReadingConfigurationStore.js`,
  `SetSteemReadingConfigurationUseCase` and Network Settings → Steem (`/settings/steem`): API nodes, thread
  accounts, first month. The commentary status line now lists three unreachable networks as "Nostr, Arweave or
  Steem".
- Tests: `tests/SteemDiscoveryThreadReader.test.js`, `tests/SteemAnnouncementReaders.test.js` (each adapter, and each
  through the real composite service it feeds) and `tests/SteemReadingConfiguration.test.js`. Two older tests that
  count commentary wiring in `ui/main.js` now expect the Steem source. The app was loaded in Chromium, and the
  settings page saved, refused an `http://` node, and linked from Network Settings.
- Not done: announcing to Steem from the Distribute dialog and commentary posting; nothing has been read from the
  real chain yet, since this environment can't reach a Steem node.

## Announcing on Steem (unnumbered, 2026-09-26)

**Publications, Snapshots, Place Naming claims and Commentary can now be announced on Steem**, completing the
substrate: Steem is the third choice, next to Nostr and Arweave, wherever an announcement substrate is chosen.

- `core/SteemDiscoveryAnnouncement.js` builds the reply and its `comment_options` (payout declined, votes on, shared
  with the threads through `steemDeclinedPayoutOptions()`), the reply permlink, and a size bound.
- `application/steem/SteemAnnouncer.js` announces as the device's saved account (`core/SteemAnnouncingConfiguration.js`,
  Network Settings → Steem → Posting), through Steem Keychain looked up at announce time. It checks the current
  month's thread exists and accepts replies (once per thread), refuses an announcement over 64 KiB, and reports
  what it broadcast with status "accepted". Every refusal has its own message: no account, no Keychain, a missing or
  closed thread, an unreachable node, too large, or a declined signature.
- One publisher per family with the existing Nostr/Arweave shapes: `SteemPublicationDiscoveryPublisher`,
  `SteemSnapshotDiscoveryPublisher`, `SteemPlaceNamingDiscoveryPublisher`, and
  `PublicationCommentarySteemDistribution#publish()`. `SteemReadingRuntimeComposition` became `SteemRuntimeComposition`.
- Wiring: the publication runtime, orchestrator and command pass a Steem publisher through for `'steem'`; the
  snapshot publisher resolver, place naming runtime and commentary wrapper select Steem; the Editor and World View
  Distribute dialogs, the Publications page and the commentary form offer Steem, and route it like Arweave (one
  publisher, not a relay fan-out); the Announcement / Discovery default accepts `'steem'`. The commentary form warns
  before posting to Steem when no account is set or Keychain is missing, since a comment's distribution runs after
  the local save and its failure is otherwise silent.
- Tests: `tests/SteemAnnouncer.test.js` (operations, the announcer's refusals, a round trip where each family's
  publisher posts and its reader reads it back, the account setting, and the composition branches). Four older tests
  that pin the two-choice selects and commentary selection now expect Steem. In Chromium the app's own
  `resolveSnapshotDiscoveryPublisher('steem')` refused without an account, then, with one saved, broadcast through a
  fake Keychain to `@forkbuild/forkbuild-snapshot-2026-09` with payout declined.
- Not done: tracking when an announcement becomes irreversible; nothing has been announced on the real chain from
  this environment, which can't reach a Steem node.

## Steem announcements wait out the reply interval (unnumbered, 2026-09-26)

**The first real Distribute to Steem posted the Snapshot, then the chain refused the Publication**: "You may only
comment once every 3 seconds" (`STEEM_MIN_REPLY_INTERVAL_HF20`). Distribute sends the two back to back from the same
account. The same run showed Steem Keychain works inside the app despite its content security policy.

- `application/steem/SteemAnnouncer.js` queues announcements, so concurrent calls go one at a time and a failed one
  never blocks the next. Before each broadcast it waits until 4.5 seconds (the interval plus a margin for clock
  differences) have passed since its own last post and since the account's `last_post` on the chain; if the chain
  still refuses for the interval, it waits once more and retries once.
- Tests: `tests/SteemAnnouncer.test.js` runs on a fake clock and checks the queue order and gap, waiting out a recent
  post from another device, not waiting for a quiet account, one retry after a refusal and no second, and a failed
  announcement not blocking the queue.

## Steem content storage proposed (unnumbered, 2026-09-26)

**A written proposal for Steem as a third Content substrate, before any code.** IPFS content stays available only
while someone pins it, and Arweave charges per upload. Every Steem full node keeps the whole block log, and uploading
costs only Resource Credits, which regenerate. The 64 KiB transaction limit, one Keychain approval per transaction and
the 3-second reply interval make it suitable for small builds only.

- `docs/Protocol.md`, "Proposed: Steem Content Storage": a `'steem'` ContentStore stores content as a manifest (a
  direct reply to a new monthly content thread, `@forkbuild/forkbuild-content-<YYYY-MM>`) and, when it doesn't fit
  inline, parts of at most 48 KiB replying to the manifest. Content is encoded as `utf8` or `gzip-base64`, whichever
  is shorter. The locator is `steem://<uploader>/<manifest permlink>`.
- Content threads keep large bodies out of Steem feeds and away from the discovery threads, whose readers fetch every
  direct reply's body.
- Part SHA-256 hashes only catch wrong or edited parts early. Trust still comes from `contentHash` and the signed
  Publication, as for every other store.
- An upload is at most 20 parts; larger builds get `ContentTooLargeError` pointing to IPFS or Arweave. Decompression
  stops at the manifest's `size`, so a small upload can't expand without bound.
- Suggested order: the inline case first (one approval), then parts with progress and resuming, then an RC estimate
  and measured compression ratios.

## Storing small Snapshots on Steem (unnumbered, 2026-09-26)

**The inline case of Steem content storage: a Snapshot stored in one Steem post, with one Keychain approval.** This
is the first step of `docs/Protocol.md`, "Proposed: Steem Content Storage". Parts, progress and resuming are not
built yet.

- `core/SteemContentManifest.js` builds and reads a manifest (a reply to `@forkbuild/forkbuild-content-<YYYY-MM>`
  whose body is the encoded content) and the `steem://<author>/<permlink>` locator. `content` joins
  `STEEM_DISCOVERY_FAMILIES`, so the operator page creates content threads too; their title and body say that
  replies store content.
- `content/SteemContentStore.js` (`storage: 'steem'`) encodes with `utf8` or `gzip-base64`, whichever is shorter
  once escaped for the operations, and refuses anything over 48 KiB with `SteemContentTooLargeError` before posting.
  Reading checks the manifest's thread, content hash and body length, refuses a manifest with parts, and stops
  decompressing past the declared size. The resolver still verifies the content hash.
- `application/steem/SteemAnnouncer.js` gains `postContent()`, sharing the announcement queue and reply interval, so
  Distribute posts the content, waits 4.5 seconds, then posts the announcement.
- Wiring: `composeSteemRuntime()` builds the store, `ui/main.js` registers it in the Snapshot creation and
  resolution registries, and `'steem'` joins `SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES`. The Distribute dialogs
  label it "Steem (small Snapshots only)", and the Publications page and the Content Provider page offer "Steem". Signed Claim material
  on Steem storage is refused with a reason, since the dialogs share one Storage choice.
- Measured: gzip then base64 shrinks typical builds only about 1.6 times, because brick UUIDs don't compress. One
  post holds about 2,500 bricks; the whole village structure library is 6.5 KB.
- Tests: `tests/SteemContentStore.test.js` (locators, the content thread, the manifest format, encoding and a bounded
  decode, a round trip through the real announcer, refusals when storing and reading, and a Distribute to Steem
  storage and a Steem announcement resolved through `DecentralizedSnapshotResolver`).
- Not done: parts, progress and resuming; the RC estimate; content threads have not been created on the chain yet,
  so storing fails with a clear message until the operator page creates them.

## Steem content storage in parts, with progress, resuming and a Resource Credits check (unnumbered, 2026-09-26)

**Builds too large for one Steem post are stored as a manifest and up to 20 parts, an interrupted upload resumes,
and an upload the account can't afford is refused before anything is posted.** This finishes the order of work in
`docs/Protocol.md`, "Proposed: Steem Content Storage", which is now marked built.

- Parts: `core/SteemContentManifest.js` builds and checks parts (replies to the manifest at
  `<manifest permlink>-p<index>`), splits `gzip-base64` text into 48 KiB slices, and refuses manifests with more than
  20 parts, other part permlinks, or lengths that don't add up. `SteemContentStore.put()` posts the manifest (listing
  every part's length and SHA-256) and then each part through `SteemAnnouncer.postContentPart()`; `get()` reads the
  parts with one `get_content_replies`, checks author, parent, permlink, length and SHA-256, and joins them.
- Progress: `put(bytes, { onProgress })` reports each accepted post; `ui/main.js` provides the latest report as
  `steemContentUploadProgress`, and the Editor and World View Distribute dialogs and the Publications page show it
  (`describeSteemContentUploadProgress()`). A render check in Chromium caught that Options API components receive the
  injected ref already unwrapped.
- Resuming: `storage/SteemContentUploadStore.js` remembers an upload whose manifest is posted, per account and content
  hash. Storing the same content again reads the manifest back and posts only missing parts, editing any changed part
  without `comment_options`; a manifest that no longer matches starts a fresh upload. A failed part throws
  `SteemContentUploadIncompleteError`, saying how many posts are stored.
- Resource Credits: `core/SteemResourceCredits.js` implements the chain's rc plugin (packed transaction size, resource
  usage for `comment` and `comment_options`, the price curve, and manabar regeneration) in BigInt, from the steemit/steem
  source. `application/steem/SteemResourceCreditEstimator.js` reads the account and prices from `rc_api` and
  `condenser_api`. Too few RC throws `SteemResourceCreditsError` before posting; no estimate lets the upload go ahead;
  the chain's own refusal is reported as running out of Resource Credits.
- The Distribute dialogs' label is now "Steem (Snapshots only)", since parts hold up to about 30,000 bricks.
- Tests: `tests/SteemContentStore.test.js` (parts, progress events, missing, edited and impostor parts, resuming after
  a declined part, fixing a changed part, a stale record, the RC refusal before and during an upload),
  `tests/SteemResourceCredits.test.js` (hand-computed sizes, usage and costs, regeneration, the estimator over a fake
  node) and `tests/SteemContentStoreBrowser.test.js` (a build in parts with Chromium's compression and WebCrypto).
- Not done: comparing the RC estimate with a live node, which this environment can't reach; the content threads
  still have to be created on the chain before anything can be stored.

## Steem anchoring proposed (unnumbered, 2026-09-26)

**A written proposal for Steem as a fourth Proof/Anchoring choice, before any code.** A Steem block is irreversible
within about a minute and its time follows a fixed 3-second schedule, and anchoring costs Resource Credits rather
than a fee. The timestamp is backed by about 21 elected witnesses rather than proof of work, so Steem is proposed
as an addition to Bitcoin anchoring, never a replacement.

- `docs/Protocol.md`, "Proposed: Steem Anchoring": anchor type `steem`, a `custom_json` with id `forkbuild-anchor`
  carrying the Publication's own `contentHash` (a `custom_json` can't be edited or deleted, unlike a post), signed
  through Steem Keychain. The proof is `{ blockNum, trxId, chain }` and nothing else. The verifier reads the
  operation from its block, never from `get_content`, treats a block that isn't irreversible yet as unavailable,
  and asks at least two API nodes. The evidence view shows the block's own time and witness.
- It sets out what Steem is weaker at (witness collusion, the 2020 takeover and Hive fork, no light client, few API
  nodes) and says the UI must describe it as "attested by Steem witnesses".
- `docs/Publishing.md` points to the proposal.
- Not done: no code yet. Order of work: the verifier and its evidence view, then the publisher, then tracking
  irreversibility, then optionally keeping block evidence and batching.

## Steem anchor verifier and publisher (unnumbered, 2026-09-26)

**Steem is a fourth, Experimental Proof/Anchoring choice: "Create Steem Anchor" broadcasts a custom_json carrying the
Publication's contentHash through Steem Keychain, and "Verify Evidence" checks it in its irreversible block.** This
is steps 1 and 2 of `docs/Protocol.md`, "Proposed: Steem Anchoring".

- `core/SteemAnchor.js`: the `forkbuild-anchor` custom_json (`{ version: 1, contentHash }`, nothing else), the
  `{ blockNum, trxId, chain: 'steem' }` proof, the `steem:<trxId>` locator, and finding an anchor in a transaction
  (condenser and appbase operation shapes).
- `anchoring/SteemProofVerifier.js`: asks each configured API node (at most three) separately for the last
  irreversible block and the block. Not yet irreversible, no answer, a node without the block and nodes that
  disagree are unavailable; a node returning another block number is left out; only an irreversible block the
  answering nodes agree on and that lacks the transaction or anchor is a rejection. The operation is read from the
  block, never from `get_content`.
- `anchoring/SteemAnchorPublisher.js`: broadcasts through the announcer's new `postAnchor()` (same queue, no reply
  interval wait), then confirms the block Keychain names, or reads the blocks since the broadcast to find the
  transaction by account and contentHash. Failures are unavailable with a reason, never thrown.
- `anchoring/SteemAnchorEvidenceView.js`: block, transaction, "Attested by: Steem witnesses (elected by stake, not
  proof of work)", and a SteemWorld block link.
- `SteemRpcClient` gains `getBlock()` and `getDynamicGlobalProperties()`. `composeSteemRuntime()` builds the three
  anchor services, and `ui/main.js` registers them, so the Publications page and the Proof/Anchoring settings page
  offer Steem (labelled as Experimental and weaker than Bitcoin). The user guide explains the difference.
- Changed from the proposal: Keychain's `requestBroadcast` rather than `requestCustomJson`, reusing the existing
  broadcaster; no `publicationId` in the operation, since a publisher is given only the contentHash; the verifier
  accepts a single answering node (the default configuration has one), and compares nodes when more are configured;
  the block's time and witness are returned by the verifier but not shown in the app yet.
- Tests: `tests/SteemAnchoring.test.js` (the format, the verifier's valid, rejected and unavailable cases over a fake
  chain with several nodes, the publisher with and without a block number from Keychain, failures, the evidence
  view, and an anchor created through `CreateExternalPublicationAnchorUseCase` and verified VALID by another replica
  once its block is irreversible).
- Not done: tracking irreversibility after publishing, showing the block's time, keeping block evidence, batching;
  not yet tried against a live node or a real Keychain from this environment.

## Steem anchoring: finality, block time, kept block evidence and batches (unnumbered, 2026-09-26)

**A Steem anchor now reports "Anchored" once its block is final, shows when its block was recorded, keeps its
signed block as evidence that can be checked offline, and several publications can be anchored with one Keychain
approval.** This finishes `docs/Protocol.md`, "Proposed: Steem Anchoring", which is now marked built.

- Finality: `anchoring/SteemAnchorFinalityObserver.js` checks the last irreversible block every 3 seconds (up to 3
  minutes) and reads the block once final, so a transaction a fork dropped is reported as dropped. `ui/main.js`
  provides it as `anchorFinalityObservers`; the Publications page watches each Steem anchor it creates and shows
  "Waiting for finality", then "Anchored".
- Block time: `ExternalAnchorVerifier` passes a proof verifier's `details` on (never deciding with them).
  `SteemProofVerifier` returns the block's time, witness and node agreement, and the Publications page shows them
  under the anchor after verifying. The evidence view shows the block time from kept evidence without any network.
- Kept evidence: `core/SteemBinary.js` serializes transactions, every current operation and the block header as the
  chain does, and computes transaction ids, block ids and the transaction Merkle tree; it matches dsteem byte for
  byte for all 45 operations (checked during development, with dsteem's ids kept as test vectors).
  `core/SteemBlockEvidence.js` keeps the signed header, the anchor transaction and its Merkle path in the proof, and
  checks offline the block id, the witness signature (secp256k1 recovery), the transaction id and its inclusion.
  Evidence is kept only after all of that checks out against the node's block, so a block this code can't read
  gives an anchor without evidence. The verifier and evidence view report evidence, and the chain still decides.
- Batches: one `custom_json` carries the Merkle root (leaves and nodes domain-separated) of up to 64 contentHashes,
  and each Publication's proof adds its path. `SteemAnchorPublisher#publishBatch()`,
  `CreateExternalPublicationAnchorUseCase#executeBatch()` and `PublicationAnchorCreationCoordinator#createBatch()` /
  `batchAnchorTypes()` create one signed anchor per Publication. The Publications page's Blockchain Anchoring tools
  have **Anchor Several Publications on Steem** (`useBatchAnchoring.js`).
- Vendored: noble's `secp256k1.js` and `legacy.js` (RIPEMD-160), through `scripts/vendor.mjs`.
- Peer exchange: kept evidence makes a Steem anchor 1–2 KB, so `PublicationAnchorPeerExchange` now also stops
  adding anchors to a RESPONSE at one message's size. Before, a publication with a few dozen such anchors would have
  produced a RESPONSE too large to send, and nothing was sent.
- Tests: `tests/SteemAnchorEvidence.test.js` (dsteem vectors, signature recovery, the Merkle tree, evidence and every
  kind of tampering, batches, the verifier and evidence, finality, the evidence view, and a batch created and
  verified VALID by another replica with the block time passed on), `tests/SteemBatchAnchoringUI.test.js` (the
  page's composables: a created anchor reported as anchored, the verification note, a batch and a declined batch),
  and `tests/SteemAnchoring.test.js` over a fake chain whose blocks are real (`tests/support/FakeSteemChain.js`).
  The Publications page was loaded in Chromium to check the new card renders without errors.
- Not done: trying it against a live node and a real Keychain, neither reachable from this environment; checking a
  kept signing key against the witness's key history.

## Signed Claims on Steem storage (unnumbered, 2026-09-26)

**A Publication's Signed Claim can now be stored on Steem, and World discovery reads it back.** Before, choosing
Steem storage in a Distribute dialog stored the Snapshot but refused the Signed Claim with "Steem storage holds
Snapshots only for now". Nothing technical stood in the way: the claim is a few kilobytes of JSON, one inline
manifest in the content thread, and its signature is what makes it trustworthy, whatever carries it.

- Storing: `composePublicationMaterialUploader({ materialStorage: 'steem', steemMaterialStore })` wraps the Steem
  runtime's `SteemContentStore` in the existing `ContentStorePublicationMaterialUploader`, as IPFS does. The store is
  passed down from `ui/main/composePublicationDistribution.js` through both publication distribution commands (the
  single-provider one and the Nostr multi-relay one). Without a store, Steem storage is refused with a reason.
- Reading: `application/worldEncounter/SteemWorldEncounterMaterialResolver.js` reads a `steem://` locator through
  its own announcer-less `SteemContentStore` with a 48 KiB limit, and follows the Arweave material resolver's
  contract (unavailable for missing or malformed content, a rejection when no node answers). `SteemContentStore`
  now attaches the node error as `cause` when it can't reach Steem, which is how the resolver tells the two apart.
  `composeWorldEncounterMaterialSources()` sends `steem://` uris to it and every other uri to Arweave;
  `composeSteemRuntime()` provides it as `publicationMaterialResolver`.
- The Distribute dialogs' storage label is now "Steem".
- Tests: `tests/SteemPublicationMaterial.test.js` (the uploader choice, a claim stored and announced on a fake
  chain through the real command, discovery, retrieval and signature verification end to end, a tampered claim
  rejected by the verifier, the resolver's refusals and rejection, and routing by uri).
- Not done: World discovery only links an announced claim to a Publication already known on this device when that
  Publication's `contentReference.uri` equals the announced uri; that is how discovery works for every substrate,
  and it is unchanged here.

## Steem content in json_metadata, with a notice in the body (unnumbered, 2026-09-26)

**Content stored on Steem now travels in each post's `json_metadata`, and the body is a one-line notice for people.**
On Steemit, stored content showed up as screens of base64, or as "comment pruned due to size". The ForkBuild app
reads the posts, not people, so the body now says what the post is: "Data stored by ForkBuild. It is read by the
ForkBuild app, not meant to be read here, and its payout is declined." with a link to `docs/Protocol.md`.
Resource Credits and the transaction limit count `body` and `json_metadata` the same way, so this costs nothing.

- Format version 2 (`core/SteemContentManifest.js`): `forkbuild.data` carries an inline manifest's encoded text and
  each part's slice; `steemContentNotice()` writes the body, which never repeats user-written text.
  `steemContentManifestOperations()` and `steemContentPartOperations()` take `data` instead of `body`, and so do the
  announcer's `postContent()` and `postContentPart()`. `steemContentPartData()` reads a part in its manifest's version.
- Version 1 posts, including everything stored before this change, still read. An unfinished version 1 upload is
  started afresh rather than finished in version 2. A part whose `json_metadata` is missing or cut short is reported
  as carrying no ForkBuild data, rather than as edited.
- `scripts/steem-threads/content-check.html` checks the one thing this depends on: that API nodes return a near-48 KiB
  `json_metadata` in full. It stores random test content (a manifest and two near-full parts, three Keychain
  approvals) through the real `SteemContentStore` and reads it back from each listed node on its own
  (`SteemContentCheck.js`). The shared operator page stylesheet now honours `hidden` on tables.
- Tests: `tests/SteemContentStore.test.js` (the version 2 format, notices, tampering with the data, version 1 manifests
  and uploads in parts, not resuming a version 1 upload) and `tests/SteemContentCheck.test.js` (the test content, and
  reading it back from a good node, one that cuts `json_metadata` short, and one that is down).
- Checked on the live chain (2026-09-26): the chain accepted the three test posts, and `https://api.steemit.com`, the
  default API node, returned all 86,110 characters unchanged
  (`steem://forkbuild/forkbuild-c-mui7cxxx-aj71p6ic#17b12eb5`). Other API nodes have not been checked yet; the page
  can read that same test content from any node added later.

## "See it in 3D": a link from a Steem post into World View (unnumbered, 2026-09-26)

**The notice on a Signed Claim stored on Steem now links straight into World View, for anyone.** The notice's only
link went to the project on GitHub; someone reading Steemit gains far more from walking around the build itself.

- The link: `https://bowo-prasetyo.github.io/forkbuild/#/view/steem/<author>/<permlink>`, naming the claim's own
  post (`core/ForkBuildAppLinks.js`). `SteemContentStore.put(bytes, { kind: 'publication' })` writes it into the
  notice ("A build published with ForkBuild: [see it in 3D](…)"); `ContentStorePublicationMaterialUploader` passes
  `kind`, which other stores ignore. Snapshot posts keep the plain notice: they're posted before the claim, so they
  can't name it.
- Why the claim and not the Snapshot: World View shows only Publications whose signature checks out (the rule World
  discovery already follows), and a bare Snapshot carries no signature.
- Opening it (`application/steem/OpenSteemPublicationLink.js`, `ui/views/SteemPublicationLinkView.js`): reads the
  claim, verifies it with World discovery's verifier, finds the Snapshot by content hash (on the device, at the
  claim's own locator, or among announced candidates on Steem, Arweave or Nostr), keeps it through
  `StoreSnapshotContentUseCase`, admits the Publication to the discovery provider and the durable admission log,
  and opens World View. Failures say why, and offer "Try again" when that could help. Wired in `ui/main.js` as
  `openSteemPublicationLink`.
- Checked in Chromium against the real app, with Playwright answering the app's Steem API calls from a fake chain
  holding a real signed build: a fresh browser following the link lands in World View with the build drawn, and a
  link to a missing post explains itself (also at phone width).
- Tests: `tests/SteemPublicationLink.test.js` (the link and notices, opening a link through the real resolver,
  verifier, Steem snapshot announcement, resolver and local store, loading the result with World View's
  `LoadPublishedWorldSessionUseCase`, reopening without a search, and each reason a link doesn't open).
- Not done: the World View panel calls any shown Publication "My Publication" and offers Unpublish and Distribute,
  including one that came from someone else; that predates this change.

## A check for putting images on Steem posts (unnumbered, 2026-09-26)

**Before notices on Steem get a build's thumbnail, a check confirms images can be uploaded from ForkBuild's own
site.** A notice with a picture, the title and the description would draw far more readers into World View, but
Steem front ends only show images from an image host, and uploading to one from `bowo-prasetyo.github.io` depends on
two things that can't be tested without the live services: that Steem Keychain signs image bytes as the host
expects, and that the host accepts uploads from this site.

- `steem/SteemImageUpload.js`: `steemImageSigningPayload()` (the "ImageSigningChallenge" prefix and the image bytes,
  as a Buffer in JSON, the form Keychain signs), `createSteemKeychainImageSigner()` over Keychain's
  `requestSignBuffer`, and `uploadSteemImage()`, which posts the image to `<host>/<account>/<signature>` and
  resolves to the address the host returns, or rejects with a `SteemImageUploadError` naming the step (signing or
  upload) and the host's answer. A blocked or unreachable upload says the host may not accept uploads from this site.
- `scripts/steem-threads/content-check.html` gains an image upload check (`SteemImageUploadCheck.js`): it draws a
  320×200 test picture, the size of ForkBuild's thumbnails, has Keychain sign it (one approval, nothing posted on the
  chain), uploads it, checks that the returned address loads, and shows each step.
- Checked in Chromium with a stand-in Keychain and image host: the picture is drawn, Keychain is asked to sign the
  prefix and the PNG (9,464 bytes for a 9,443-byte image), the upload goes to `/<account>/<signature>` as form data,
  and the preview loads; also at phone width.
- Tests: `tests/SteemImageUpload.test.js` (the payload, the signer, uploading and each way it fails, and the check).
- Checked live (2026-09-26, account `forkbuild`): Steem Keychain signed the 10,017-byte test image (a 130-character
  signature), steemitimages.com accepted the upload from this site and returned
  `https://cdn.steemitimages.com/DQmYHT6cvKFRcympSgDeXukiQ4uLgVMfihjb3yPvZhB2adi/forkbuild-image-check.png`, which
  loads. The returned address is on `cdn.steemitimages.com`, not the upload host.
- Not done: the notice itself (thumbnail, title and description on a Signed Claim's post).

## A picture, title and description on Steem notices (unnumbered, 2026-09-26)

**A Signed Claim's post on Steem now shows the build: its thumbnail, title, author and description, above the "See
it in 3D" link.** A picture and a few words draw far more Steemit readers into World View than a line of text.

- `core/SteemContentManifest.js`: `steemContentNotice({ viewUrl, card })` lays out the card (the picture links to the
  view too), and `json_metadata.image` lists the picture for front-end previews. `steemNoticeText()` makes
  user-written text safe for Markdown: one line, no links, no control or direction-override characters, HTML and
  Markdown escaped, `@` and `#` broken with a zero-width space so they neither notify nor tag, and capped (title
  100, author 40, description 300). `isSteemNoticeImageUrl()` accepts only https addresses that can't end the
  Markdown early.
- `application/steem/SteemPublicationNoticeCard.js`: the describer finds each part on its own (title and author from
  the claim, description from the build in the local content store, the picture drawn and uploaded) and falls back
  part by part. `SteemPublicationNoticeComposition.js` supplies the browser pieces: `DocumentThumbnailRenderer`
  (created on first use) and `uploadSteemImage()` through Steem Keychain, as the Steem account in settings.
- `SteemContentStore` takes a `describePublication` hook and asks it before posting a Signed Claim (reporting phase
  `describing`: "adding a picture of the build. Approve signing the picture in Steem Keychain."); a hook that fails
  leaves the plain link notice and never stops the post. Wired through `composeSteemRuntime()` from
  `ui/main/composeWorldDiscovery.js`.
- Checked in Chromium with a stand-in Keychain and image host: a stepped pyramid from a local content store was drawn
  by the real WebGL thumbnail renderer, signed, uploaded and laid out, with a mention and a tag in its description
  neutralised.
- Tests: `tests/SteemPublicationNotice.test.js` (the text rules, including links, mentions, tags, HTML, Markdown,
  hidden characters and caps; picture addresses; the layout; the describer and each fallback; the store asking only
  for Signed Claims, reporting progress, and posting plainly when the card fails).
- Checked live (2026-09-26): distributing "Twin House With Rabbits" posted
  `@forkbuild/forkbuild-c-muiesncy-wkg6k1nb` with its thumbnail uploaded to
  `https://cdn.steemitimages.com/DQmf2MADzdCGgTshHpSNXKSV9CRACfPuurhnNznJ5X4ocPG/forkbuild-build.png` and listed in
  `json_metadata.image`. That build's description was its title, so the notice showed it twice; a description that
  only repeats the title is now left out.
- Checked live on a device that had never opened ForkBuild: the notice's link showed the loading page, then World View
  with the build, fetched from Steem and checked on the way.

## Share and Copy link for a distributed Publication (unnumbered, 2026-09-26)

**A Publication whose Signed Claim is on Steem now offers Share… and Copy link, so a builder can send friends the
link that opens the build in 3D on any device.** The `#/world/<documentId>` address works only in a browser that
already has the build; the `#/view/steem/…` link works anywhere, so it is the one to share.

- `publicationShareUrl(material)` (`core/ForkBuildAppLinks.js`) turns a distribution's `steem://` material locator
  into the view link. `application/publication/PublicationShareLink.js`: `describePublicationShare()` (nothing
  before a distribution; the link, title and text for a Steem claim; a reason to distribute with Steem storage for a
  claim elsewhere), `sharePublicationLink()` (the Web Share API, falling back to the clipboard; closing the sheet
  is not an error) and `copyPublicationShareLink()`.
- `ui/components/PublicationShareLink.js` follows the Publication's distribution record, so it appears as soon as a
  distribution finishes. It is shown in World View's publication panel, in the Editor and World View Distribute
  dialogs' results (which now take `publicationId` and `publicationTitle`), and on the Publications page.
- Found while building it: startup restores distribution records only for Publications in the catalog, so a build
  published from the Editor lost its record in memory after a reload. The component restores its Publication's
  record on demand through `publicationDistributionLifecycleRestorer`, now provided by `ui/main.js`.
- Checked in Chromium on the real app: a build opened from its Steem link, given a Steem distribution record and
  reloaded, shows Share… and Copy link in World View's panel; Copy link copied the link and Share passed the title,
  text and link to the share sheet (both stubbed).
- Tests: `tests/PublicationShareLink.test.js` (the link, what is offered, a real distribution command making the
  link available, and sharing, cancelling, falling back and copying).
- Not done: links for claims stored on Arweave or IPFS.

## Distribution records saved for every Publication (unnumbered, 2026-09-26)

**A build published from the Editor now keeps its distribution record, and so its Share button, after a reload.** On
the live site, World View showed no Share button for "Thin Pyramid with Stair", distributed with its claim on Steem.
The persistence bridge saved a distribution record only for Publications it was told to watch at startup: the
catalogued ones that already had a saved record. A build published from the Editor is not in the catalog, so its
distribution was held in memory only and gone after a reload; restoring it on demand (the previous change) found
nothing to restore. The earlier check in Chromium had written the record by hand, which hid this.

- `PublicationDistributionLifecycleMemoryStore#subscribeAll()` reports every Publication's changes, and
  `PublicationDistributionLifecyclePersistenceBridge#observeAll()` saves each of them. `ui/main/composeWorldDiscovery.js`
  uses it in place of watching the restored ids one by one.
- Checked in Chromium on the real app, with no record written by hand: a build opened from its Steem link and
  distributed from World View's Distribute dialog (claim on Steem, announced on Steem, through a stand-in Keychain
  posting to a fake chain) shows the share link in the dialog and, after a reload, in World View's panel. The same
  run without this change shows it in the dialog and not after the reload.
- Tests: `tests/PublicationShareLink.test.js` (a Publication no one watched is distributed, its record is saved, and
  after a reload the share link comes back; a failing listener doesn't stop the others). It fails without the change.
- Publications distributed before this change have no saved record; distributing them again saves one.

## Share links for claims on Arweave and IPFS (unnumbered, 2026-09-26)

**Share… and Copy link now work for a Publication whose Signed Claim is stored on Arweave or IPFS, not only
Steem.** The links are `#/view/ar/<transaction id>` and `#/view/ipfs/<cid>`, next to `#/view/steem/<author>/<permlink>`,
and open the same way: the claim is read and verified, the build found by content hash and checked, and World View
opened on it.

- `core/ForkBuildAppLinks.js`: `describePublicationClaimLocator()`, `publicationViewUrl()` and
  `publicationClaimLocatorFromViewPath()` turn a claim's locator into a link and back, accepting only an Arweave id of
  43 base64url characters and a bare CID, so nothing odd reaches a link or a gateway.
- `application/publication/OpenPublicationLink.js` (moved from `application/steem/`, which keeps
  `openSteemPublicationLink()` as a thin wrapper) takes a claim locator on any of the three networks; its messages
  name the network, and an Arweave claim not found yet says a new upload can take a few minutes.
- `application/publication/PublicationClaimRetriever.js` picks the reader by network: the Steem resolver, the Arweave
  material resolver over the configured gateways, and the new `IpfsWorldEncounterMaterialResolver` over the
  configured IPFS gateways (48 KiB at most, a JSON object). `composePublicationClaimRetriever()` builds it for
  `ui/main/composeWorldDiscovery.js`, which keeps the UI from naming concrete resolvers.
- `ui/views/PublicationLinkView.js` (renamed from `SteemPublicationLinkView.js`) serves all three routes and offers
  Try again when a network or search couldn't be reached, the build wasn't found, or an Arweave or IPFS claim isn't
  there yet. Share adds a note for Arweave (minutes after distributing) and for the builder's own IPFS node (only
  while it's online); none for Steem or a remote pinning service.
- Checked in Chromium on the real app, in fresh browsers: an Arweave link and an IPFS link (claims served as
  arweave.net and ipfs.io would, the Snapshot announced on a fake Steem chain) each opened World View on the build;
  a missing Arweave claim showed the "few minutes" message with Try again.
- Tests: `tests/PublicationLinkNetworks.test.js` (the links both ways and what they refuse, Share's notes, the IPFS
  reader and its refusals, the retriever, and opening Arweave and IPFS links through the real Arweave resolver and
  IPFS gateway store with a really signed Publication, including a claim not there yet and a network down).
- Also fixed in the user guide: the "Share with friends" paragraph had been inserted into the middle of "Sharing a
  link on Steem".

## IPFS share links: time to find content, and a clearer message (unnumbered, 2026-09-26)

**Opening an IPFS share link now gives each gateway 30 seconds, and says plainly what went wrong and what to do.** On
the live site, a link to a claim on IPFS failed with "IpfsGatewayContentStore: could not reach gateway at
https://gateway.pinata.cloud — signal is aborted without reason": the gateway store gives up after 5 seconds, and a
gateway often needs tens of seconds to find content that lives on someone's own IPFS node. With one gateway
configured, there was nothing to fall back to.

- `composePublicationClaimRetriever()` gives IPFS gateways 30 s (`PUBLICATION_CLAIM_IPFS_TIMEOUT_MS`) when reading a
  claim for a link; the gateway stores' 5 s default elsewhere is unchanged.
- `IpfsGatewayContentStore` reports its own timeout as "gateway at … did not answer within 30 s" instead of the
  browser's abort text.
- When IPFS can't be reached, the link page adds: a gateway can take a while to find content on someone's own node,
  so try again, and adding another gateway in Network Settings (such as https://ipfs.io or https://dweb.link) gives
  one to fall back to.
- Checked in Chromium on the real app: a gateway answering after 8 s (which the 5 s limit cut off) now opens World
  View; one that never answers shows the new message after 30 s, with Try again.
- Tests: `tests/PublicationLinkNetworks.test.js` (the timeout message, and the advice on IPFS but not on Arweave).

## Free public servers as Network Settings defaults, and Reset to Defaults (unnumbered, 2026-09-26)

**Every list-shaped Network Settings page now defaults to several free public servers, and every one offers the same
Reset to Defaults.** Most defaults were a single server (arweave.net, ipfs.io, relay.damus.io, blockstream.info,
api.steemit.com), so the failover and fan-out code already in place had nothing to fall back to unless a person
configured more by hand. The Bitcoin endpoint could not hold more than one server at all.

- New default lists, each next to its value object: Arweave `arweave.net`, `ardrive.net`, `permagate.io`; IPFS
  `ipfs.io`, `dweb.link`, `4everland.io`, `ipfs.filebase.io` (from the IPFS project's public-gateway-checker list);
  Bitcoin `blockstream.info/api`, `mempool.space/api`; Nostr `relay.damus.io`, `nos.lol`, `relay.primal.net`; Steem
  `api.steemit.com`, `api.justyy.com`. The singular `DEFAULT_*_URL` constants stay, as each list's first entry, for
  the paths that take one endpoint (Arweave publishing and anchoring, single-relay Place Naming discovery).
- Deliberately unchanged: STUN (`peer/IceServerConfig.js` records why ICE entries are added one tested at a time), TURN
  and Rendezvous. The default TURN relay already comes from the rendezvous servers (`GET /turn-credentials` on
  `server/rendezvous-worker/`, short-lived credentials fetched when a connection starts); the TURN Server page is only
  for a relay of one's own, so a built-in default there would mean publishing a credential. Its page now says so,
  instead of claiming there is no default relay. Rendezvous is our own server. Steem stays at two nodes because
  `SteemProofVerifier` needs every answering node to agree, so each extra node is one more that can hold a proof
  back as unavailable.
- Bitcoin: `BitcoinEsploraConfiguration` takes `apiUrls` (a saved single `apiUrl` still loads), and
  `anchoring/BitcoinEsploraFailover.js` wraps each Esplora adapter. Reads and broadcasts move to the next endpoint
  only when one is unreachable; a definite answer, including a broadcast rejection, is never retried elsewhere.
- `ui/composables/useEndpointListSettings.js` gives the Arweave, IPFS, Bitcoin, Nostr, STUN and Rendezvous pages one
  shape: the servers in effect are listed; the text box starts from them; Save is disabled until it changes, so the
  defaults are never saved as a preference and later default updates still reach people who never changed anything;
  **Reset to Defaults** (formerly "Use Deployment Default" or "Use Defaults" on most pages) clears the store. The
  Steem page, with its three fields, follows the same Save rule and button.
- `scripts/check-network-defaults.mjs` checks every default still answers and allows CORS from the site's origin.
  It could not be run from the sandbox this was built in (outbound traffic to these hosts is blocked there); DNS
  showed `ar-io.net` no longer resolves, so `ardrive.net` took its place.
- The IPFS share-link advice no longer suggests adding ipfs.io or dweb.link, which are now defaults.
- Tests: `tests/BitcoinEsploraFailover.test.js` (each wrapper's failover and when it stops, and the use cases building
  a wrapper only for two or more endpoints); `tests/NetworkSettingsSharedForms.test.js` (every list page starts from
  its defaults, won't save them unchanged, and Reset refills them); `tests/SteemReadingSettingsView.test.js` (the same
  for the Steem page); Bitcoin configuration and persistence tests for the list shape.

## Announcement Index: record discovery results and show them first (unnumbered, 2026-09-26)

**Everything discovery finds is now kept on this device, and World View shows it before the network answers.**
A Nostr or Arweave query returns only the newest 20 announcements for a tag, and Snapshot candidates, Place
Naming claims and Publication leads were held in memory only. So every visit started from nothing, and an
announcement pushed out of that newest page was never seen again. docs/AnnouncementIndex.md sets out the whole
design in six phases; this entry covers Phases 1 and 2.

- `application/announcementIndex/AnnouncementIndex.js` stores records per kind and tag in the same storage as
  everything else (IndexedDB in the browser). Each record has a key, a payload, the origins that reported it,
  and first- and last-seen times. It holds at most 2,000 records a tag, dropping the least recently seen, and
  refuses payloads over 8 KiB. `AnnouncementKinds.js` defines each kind's checks and key. A Place Naming claim's
  key includes its signature, so a forged copy under a real claim id is kept beside the real claim, never in its
  place, and a claim must belong to the region tag it is stored under.
- `IndexedDiscoverySources.js`: every Nostr, Arweave and Steem source of Snapshot candidate and Place Naming
  discovery is wrapped so its successful results are recorded. Results and failures pass through unchanged, and
  a failure to record is ignored. The index joins each aggregator as one more source. An empty index reports
  UNAVAILABLE, never EMPTY, so it cannot turn "every substrate failed" into "nothing was announced". Publication
  discovery services also return the leads they found before for the same origin, so a lead keeps the origin
  that decides how its material is fetched.
- World View, on its first refresh with a position, hands indexed Snapshot candidates to automatic placement and
  seeds nearby Place Naming claims (`PlaceNamingDiscoveryMonitor#seed()`, which only fills an empty result).
  Network discovery still runs on the same refresh and replaces the seeded claims.
- Checked in Chromium on the real app: with a Snapshot candidate saved in the index, opening World View requested
  its Arweave locator while every relay and gateway was unreachable.
- Tests: `tests/AnnouncementIndex.test.js` (keys, merging across origins, persistence, limits, each kind's checks,
  recording being transparent to callers, the Snapshot, Place Naming and Publication paths answering from the
  index while offline, and seeding). `tests/SnapshotDiscoveryOutcomePresentationClosureAudit.test.js` accepts
  the wrapped Nostr source in its check of the production wiring.

## Announcement Index: sync cursors (unnumbered, 2026-09-26)

**A sync now pages each substrate until every announcement under a tag has been read**, rather than taking the
newest 20. This is Phase 3 of docs/AnnouncementIndex.md; nothing runs it on its own yet (Phase 4 adds the
background scheduler).

- `application/announcementIndex/NostrTagSync.js`: per relay and target, a cursor of the newest and oldest
  `created_at` read, plus a gap while newer events are still being paged down. The head pages down from the top
  to `newest`; backfill pages below `oldest`. Only an empty page ends paging, because relays cap page sizes below
  the requested `limit`. Boundaries are inclusive, so events sharing a boundary's second are read again rather
  than skipped.
- `application/announcementIndex/ArweaveTagSync.js`: GraphQL pages sorted `HEIGHT_DESC`, continued with each
  edge's `cursor`. The head reads down to the previous run's newest ids; backfill resumes from a saved page cursor
  until `hasNextPage` is false. Bodies are fetched with the existing 48 KiB cap.
- Each run reads at most five pages of 100 per endpoint, so a large backlog is read over several runs, and a burst
  of new announcements larger than that is finished on the next run without skipping anything.
- `AnnouncementSyncTargets.js`: the Snapshot tag and each Place Naming region tag record into the index;
  `forkbuild-commentary` imports each envelope through `importCommentaryEnvelope()`, which verifies its signature,
  into the Commentary store. Tag names come from each kind's own reader or publisher. Publication leads are not
  synced: their tags are typed per search.
- `AnnouncementSync.js` runs one target on every relay, the Arweave endpoint and Steem at once, and reports each
  endpoint's outcome; one failing never stops the others.
- Tests: `tests/AnnouncementSync.test.js`, against a fake relay that pages like a real one (inclusive
  `since`/`until`, newest first, an optional server-side cap) and a fake GraphQL gateway with edge cursors. It
  covers a 250-event backfill over several runs, a relay capping pages at 7, a 100-event burst after catching up,
  15 events in one second across a boundary, Arweave head and backfill, one relay failing while the others
  succeed, and the Place Naming and Commentary targets.

## Announcement Index: background sync (unnumbered, 2026-09-26)

**The Announcement Index now fills itself in the background**, from the first time World View opens in a session,
and keeps doing so after it closes. This is Phase 4 of docs/AnnouncementIndex.md. Until now, discovery searched only when World View's player had moved 100 units,
when a Commentary section opened, or when **Discover** was clicked.

- `application/announcementIndex/BackgroundAnnouncementSync.js` runs the Phase 3 sync 10 s after it starts, then
  every 5 minutes, or every 30 s while an endpoint is still behind. It skips runs while the tab is hidden, and runs
  targets one after another. The Snapshot and Commentary tags are synced every run. Place Naming region tags take
  turns, ten per run.
- `AnnouncementIndex#watch()` / `watchedTags()`: every discovery search notes its tag, found or not, so the sync
  keeps reading the regions a player has visited. It keeps the 100 most recent tags, and writes a tag at most
  once a minute.
- `ui/main/composeAnnouncementSync.js` wires the scheduler to the configured relays, Arweave gateway and Steem
  reader. Imported Commentary goes through the existing notification bridge, so a new comment on one of this
  identity's Publications is announced even when no Commentary section is open.
- World View subscribes: after each run it re-hands indexed Snapshots to automatic placement, and replaces its
  nearby Place Naming claims with the index's (`PlaceNamingDiscoveryMonitor#seed(…, { replace: true })`).
- It starts when World View first opens, not when the app opens: docs/Privacy.md promises that opening the app
  contacts nothing but the site it is served from.
- Checked in Chromium on the real app: the Home page made no sync request; about 10 s after World View opened,
  the sync queried Arweave GraphQL for the Snapshot and Commentary tags, newest first.
- Two older tests that match source text now allow for the sync: `tests/PublicationCommentaryNostrAsynchronousDistribution.test.js` counts five notification bridge call sites, not four. World View listens through `onSynced()`, so `tests/WorldViewPublicationDistributionIntegration.test.js`'s ban on `.subscribe(` in World View still holds.
- Tests: `tests/BackgroundAnnouncementSync.test.js` covers:
  - the first-run delay, the catch-up and regular intervals, and stop;
  - hidden tabs, and `runNow()` joining a run in progress;
  - rotation;
  - a failing run still being rescheduled, and a broken listener not stopping the others;
  - watched tags and their write throttle;
  - replacing seeded claims.

## Announcement Index: peers share their index (unnumbered, 2026-09-26)

**Connected peers now share their Announcement Indexes**, so one connection gives a new device every Snapshot and
Place Naming claim its peer has discovered. This is Phase 5 of docs/AnnouncementIndex.md.

- New peer protocol `forkbuild:announcement-index` (docs/Protocol.md, "Announcement Index exchange").
  - When a peer authenticates, each side sends a SUMMARY: kind, tag, count and a digest of the record keys per
    tag, at most 300 tags within one message.
  - The other side REQUESTs each tag whose digest differs, at most 50 per summary. RESPONSEs carry the payloads,
    split to fit peer messages.
- Only Snapshot candidates and Place Naming claims are shared. A Publication lead's origin cannot be vouched for
  by a peer, and Commentary has its own protocol.
- Received records pass the index's usual checks and carry the origin `peer:<identityId>`.
  - A RESPONSE counts only for a tag requested from that peer in the last five minutes.
  - A peer may add at most 20,000 records an hour.
  - A Place Naming author may hold at most 100 claims per region tag.
- `composeAnnouncementSync()` now also builds the exchange, and gives World View one `announcementIndexChanges`
  signal for both finished syncs and peer records (grouped over one second).
- docs/Privacy.md: connected peers learn which tags this device holds, including the World regions it has searched
  for Place Naming.
- Tests: `tests/AnnouncementIndexPeerExchange.test.js` covers:
  - two devices on the real in-memory peer network exchanging both ways, without Publication leads;
  - identical indexes sending only summaries;
  - a misbehaving peer, where unrequested, expired, over-author-cap and over-hourly-cap records are all refused;
  - responses split to fit peer messages.

## Announcement Index: narrower tags for Snapshots and Commentary (unnumbered, 2026-09-26)

**Snapshot and Commentary announcements now carry a narrow tag beside their global one**, and readers ask for it.
This is Phase 6, the last phase of docs/AnnouncementIndex.md. Both global tags are shared by every announcement
in the network, so a capped query under them can miss exactly the Snapshots near the player or the comments on
one Publication.

- `core/NarrowDiscoveryTags.js`: `forkbuild-commentary:<publicationId>`, and
  `forkbuild-snapshot:cell:<cx>:<cz>` for a Snapshot's claimed position in 1,000-unit cells.
- Publishing: the narrow tag rides on the same Nostr event (a second `t` tag) or Arweave transaction.
  `createArweaveTaggedTransactionUpload()`'s `uploadTaggedTransaction(material, tag, extraTags = [])` signs every
  tag. The Nostr and Arweave Snapshot publishers add the cell tag when there is a claimed position; both Commentary
  distributions add the Publication tag. Steem is unchanged: announcements there are replies to monthly threads,
  which tag feeds don't list, and readers fetch each thread whole and filter on the device.
- Reading:
  - Commentary `discover(publicationId)` reads both tags on Nostr and Arweave, and returns an event found under
    both only once.
  - World View's Snapshot discovery reads the player's cell beside the global tag
    (`WorldSnapshotDiscoveryMonitor` now passes its spatial context to the command). The background sync reads
    watched cells in turn. On startup, World View shows the index's 3×3 cells around the player.
  - The index stores a Snapshot under a cell tag only when its claimed position lies in that cell.
  - Global tags are still read, so earlier announcements are still found.
- Tests: `tests/NarrowDiscoveryTags.test.js` covers:
  - the tag helpers, including negative coordinates and -0;
  - the Nostr and Arweave Snapshot publishers adding the cell tag only with a position, and the upload signing
    extra tags;
  - both Commentary distributions tagging and reading the Publication tag;
  - the monitor passing its context;
  - the index refusing a Snapshot filed under the wrong cell.

## Announcement Index: background sync starts with the app (unnumbered, 2026-09-27)

**The background announcement sync now starts when the app opens**, whichever page is shown, instead of the first
time World View opens. It reads only announcements (small pointers and signed claims, at most 48 KiB each), never
content bytes, and publishes nothing, so starting it early costs little. In return, the index is already fuller
by the time a player reaches World View.

- `ui/main.js` starts `BackgroundAnnouncementSync` at load; World View no longer starts it.
- docs/Privacy.md no longer says that opening the app contacts only its own site. It names this one automatic
  exception, and adds a row for the background sync to the table of servers: which relays, gateway and Steem
  nodes it queries, and for which tags.

## Phones and tablets: touch controls and a compact layout (unnumbered, 2026-09-27)

**ForkBuild can now be played on a phone.** Until now every control needed a keyboard or a mouse: walking only
answered W/A/S/D, panning needed a right-drag, multi-select needed Ctrl or Shift, and the page kept its desktop
layout at any width, so the nav, the World View panel and the Editor sidebar covered most of a phone's screen.

- World View touch pad (`ui/components/TouchMovementPad.js`), shown on touch screens while Avatar Control Mode is
  on, with a **Walk** button that toggles the mode:
  - A joystick for W/A/S/D. `core/TouchJoystickKeys.js` maps the thumb's offset to keys in eight sectors, with a
    dead zone, and holds Shift (run) at the rim.
  - **Jump**, and context buttons shown under the same conditions as the on-screen prompts: Ride/Get Off (`E`),
    Store/Deploy (`Q`), Catch/Release (`F`), and, while riding, steering (`←`/`→`) and Brake (`Ctrl`).
  - `application/avatar/TouchMovementInput.js` turns these into the session's existing
    `avatarKeyDown`/`avatarKeyUp`, so the session stays the one place that decides what a key does. It sends a key
    only when its held state changes, and holds each button for at least 120 ms: the session samples Jump and the
    interaction keys once per frame, so a quicker tap could be missed.
- Editor touch input (`application/editorSession/pointerInputMethods.js`): the tools act on pointer-down, so with
  one finger both orbiting and tapping, every orbit placed a brick or cleared the selection. A touch now reaches
  the tools only when it lifts as a tap (moved at most 10 px, no second finger), replayed as a hover, press and
  release at the lift point, which also gives Place a fresh preview to commit. Gizmo handles still take a touch at
  once. A lost pointerup cannot block later taps, and pointercancel drops the tap.
- Editor touch bar (`ui/components/EditorTouchActionBar.js`): Undo, Redo, Rotate, Delete, Multi (each tap becomes a
  Ctrl-click, toggling a brick in or out of the selection) and More (the Command Palette). Each runs the same
  `EditorActionRegistry` action as its shortcut; Rotate while placing sends the Place tool's `R`.
- `R` in the Place, structure placement and composition tools now turns the next preview even when nothing is
  hovered yet, instead of doing nothing. Touch never hovers before a tap, so Rotate would otherwise not work there.
- Compact layout at 720 px and narrower (`css/main/touch-and-compact.css`, `ui/composables/useMediaQuery.js`): the
  nav folds behind a **Menu** button, World View's panel opens from a **Panel** button and starts closed, the
  navigation HUD shrinks, the Editor sidebar becomes a drawer opened from **Tools** (closing when something is
  picked to place), and the Editor toolbar scrolls sideways. Buttons get 40 px tap targets on touch screens, and
  the 3D views set `touch-action: none` so the page does not scroll or zoom under a drag. Desktop layouts are
  unchanged.
- Docs: a Touch screens section in docs/user/ControlsReference.md, notes in the Editor and Avatars guides, and
  docs/Architecture.md on how touch reaches the tools and the avatar.
- Tests: `tests/TouchMovementInput.test.js` covers the joystick's sectors, dead zone, run threshold and thumb clamp,
  key transitions, the button minimum hold and `releaseAll`. `tests/EditorTouchTap.test.js` covers a tap replaying as
  a click, drags and two-finger touches never reaching the tools, stale pointer ids, pointercancel, Multi-select
  and gizmo drags by touch, and that mouse input is unchanged. `tests/PlacementPreviewUX.test.js` now checks that a
  turn made before any hover carries into the next preview.

## Phones and tablets: stored-vehicle cycling and animal decoration by touch (unnumbered, 2026-09-27)

**The touch pad can now choose which stored vehicle to deploy and decorate a World with an animal**, two of the
four keyboard actions the first touch release left out. Desktop gets a prompt for `G`, which had none.

- `ui/components/avatarInteractionLabels.js` formats the store/deploy and decoration states the session already
  resolves, for both the keyboard prompts and the pad, so they show the same actions under the same conditions.
  The vehicle and species names moved here from the two prompt components.
- Cycling: with two or more vehicles carried, **‹** and **›** beside **Deploy** press `[` and `]`. Deploy names the
  selected vehicle and its place in the list ("Deploy Car 2/3").
- Decoration: World View now polls `animalDecorationInteractionState()` with the other interaction states.
  - The pad shows **Decorate** or **Undo Decoration**.
  - `AnimalInteractionPrompt` shows "[G] Decorate with <Species>" or "[G] Undo <Species> Decoration".
  - The button does not press `G`: the session's `G` ignores a refusal (not signed in, no EDIT access) on purpose,
    which suits a stray key press but leaves a tapped button doing nothing. The button runs
    `toggleNearestAnimalDecorationHere()` through World View's `guarded()`, which shows the reason, and the fork
    notice when decorating made an editable copy.
- The keyboard prompts are hidden while the touch pad shows, since the pad's buttons replace them; before, they
  overlapped the pad.
- Hands-free continuous movement and Editor box selection still have no touch control; they are next.
- Tests: `tests/AvatarInteractionLabels.test.js` covers store vs deploy, the position shown only with several
  vehicles, no cycling while riding, decorate winning a tie as `G` does, and fallback names.

## Phones and tablets: hands-free Cruise (unnumbered, 2026-09-27)

**The touch pad has a Cruise button for the hands-free walk and run** that `Alt` + `W` starts on a keyboard, so a
player can travel without holding the joystick.

- Each tap takes the next step: walk forward, then run, then stop. The button sends the keyboard's own chords
  (`Alt`+`W`, `Alt`+`Shift`+`W`, then a plain `W`, which ends any hands-free movement) through
  `avatarKeyDown`/`avatarKeyUp`, so the continuous-movement rules stay in the session alone. `cruiseChord()` in
  `application/avatar/TouchMovementInput.js` picks the chord; `pressChord()` sends it at once (a chord is read on
  keydown and needs no minimum hold), without releasing a W or Shift the joystick is holding.
- `WorldNavigationSession#avatarContinuousMovementState()` reads the current intent and mode, which World View
  polls with the other interaction states so the button shows **Cruise: Walk**, **Cruise: Run** or, for a backward
  cruise started from a keyboard, **Cruise: Back**.
- As on a keyboard, pushing the joystick forward or back stops a cruise, and pushing it sideways steers it.
- Tests:
  - `tests/TouchCruiseIntegration.test.js` drives a real `WorldNavigationSession` through walk, run and stop,
    checks that the joystick turns without stopping and stops when pushed forward, and that there is no state
    without an avatar.
  - `tests/TouchMovementInput.test.js` adds the chord for each state, and a chord's order and its respect for
    keys the joystick holds.

## Phones and tablets: box selection by touch (unnumbered, 2026-09-27)

**The Editor's touch bar has a Box button, the touch form of the Shift-drag marquee**, the last of the four
keyboard-only actions the first touch release left out.

- While **Box** is on, a one-finger drag draws the selection box (`application/editorSession/pointerInputMethods.js`
  reuses the Shift-drag marquee state, `marqueeSelect()` and the overlay). With **Multi** also on the box adds to
  the selection, as `Ctrl/Cmd+Shift`-drag does. A still tap is still a tap, and gizmo handles still take a touch
  first.
- The camera controls are off while the box is drawn, as for Shift-drag, so the camera never sees that finger and
  a second finger cannot become a pinch. A second finger or a pointercancel cancels the box and turns the controls
  back on. So the scene works like a drawing surface while Box is on, and the player turns Box off to move the
  camera; turning it off cancels any box in progress.
- Fixed from the first touch release: on phones narrower than about 380 px the open Tools drawer (85% of the
  width) covered its own Hide Tools button, so it could not be closed. The drawer is now at most the width less
  7rem.
- The touch bar's buttons are a little narrower so all seven fit a 360 px-wide phone; narrower screens scroll it.
- Tests: `tests/EditorTouchTap.test.js` adds a box drag (rect, replace, camera off then on), Box with Multi
  (additive), a still tap in Box mode, cancellation by a second finger and by pointercancel, and gizmo handles
  winning over the box.

## Snapshot bytes: read locally first, fetched only nearby (unnumbered, 2026-09-27)

**World View no longer downloads every Snapshot the Announcement Index knows about, and never downloads one this
device already holds.** Content bytes are the expensive part of discovery. Before, opening World View handed every
indexed Snapshot under the global tag (up to 2,000) to the automatic cascade at once, with no limit on how many
downloaded in parallel. And the resolve step always fetched from the store the announcement's locator names, so a
Snapshot already stored locally was downloaded again on every visit; the store step only noticed afterwards
(`ALREADY_AVAILABLE`).

- Local first: `DecentralizedSnapshotResolver#resolveCandidate()` (and `resolve()`) take an optional
  `localContentStore`. When it holds the candidate's content hash and those bytes verify, they are returned as
  `RESOLVED` without asking the network, or even needing a network store. A miss, a failing read or a mismatch
  falls through to the network as before, so a bad local copy is never trusted and never blocks. Both
  `executeResolveSelectedSnapshotCommand()` and `executeDiscoverSnapshotCommand()` forward it, and
  `ui/main/composeSnapshotDiscovery.js` passes `publicationContentStore`, the IndexedDB-backed store Snapshots are
  materialized into. So the manual Resolve button and link opening benefit too.
- Nearby only: `application/snapshot/NearbySnapshotCandidates.js` picks which candidates World View's cascade
  gets. A candidate is kept when its position lies in the 3×3 map cells around the viewer, the block discovery
  already reads. The position is the local placement for its Publication when there is one, otherwise the
  announcement's `claimedPosition`; this decides only what is worth fetching, never where anything is placed,
  so the cascade still never reads `claimedPosition`. Candidates with no position (announcements from before
  claimed positions) are kept up to 20 per call, newest first, the cap the global tag's network query used to
  impose. A candidate skipped now is offered again as the viewer moves near it.
- A few at a time: World View wraps the cascade's resolve command in `limitConcurrency()` (`utils/`), four at
  once. A fetch still waiting when the view closes is skipped.
- Not done: removing fetched Snapshots when storage runs short. They share the store with the player's own
  published content, so removal needs to know which entries were fetched from elsewhere.
- Tests:
  - `tests/LocalFirstSnapshotResolution.test.js`: a local hit skips the network (even without a network store), a
    miss fetches, a mismatching, failing, throwing or vanished local copy falls through, both commands forward the
    store, and a Snapshot fetched and stored once is read locally the next time.
  - `tests/NearbySnapshotCandidates.test.js`: the cell block, a placement winning over a claim, the cap on
    candidates with no position, no viewer position, and `limitConcurrency()`'s limit, order and error handling.

## Public lobby and the rendezvous answer mailbox (unnumbered, 2026-09-27)

**People who don't know each other's identity ids can now meet and connect: an opt-in public lobby, one for
everyone and one per World.** Until now every connection started from an identity someone already had, because
the rendezvous server only answers "where is this exact identity?". That keeps strangers from ever being listed,
but it also meant a new player knew nobody to connect to. The lobby adds the smallest opening that keeps the
existing rules: a list of only those who chose to join, holding no addresses.

- The answer mailbox came first, because the lobby cannot work without it. A rendezvous publication carried the
  WebRTC offer, but the answer had to be copied back by hand, which strangers cannot do, and which also left the
  automatic Known Peer connection (0.9.345) unable to complete. The worker now takes `POST_ANSWER` (signed by the
  answering identity; the first answer per publication wins, and an answered publication is no longer returned
  by LOOKUP) and `FETCH_ANSWER` (signed by the publisher, because an answer lists the answerer's addresses).
  `PeerSessionManager#connectToDiscovered()` leaves the answer there and reports `delivered`; `publishSelf()`
  polls for one and completes the connection itself; an answer it cannot apply closes the pending connection, so
  the spent publication never looks available. Without a signing identity or a mailbox the reply is still
  returned to hand over.
- Lobby cards (`core/LobbyCard.js`): identity, lobby (`public` or `world:<documentId>`), a self-chosen display
  name of at most 40 characters, a lifetime of at most 15 minutes, signed by the identity. No offer and no
  address. The worker gains `JOIN_LOBBY`, `LEAVE_LOBBY` and `LIST_LOBBY` (a random sample of at most 50), with
  replay protection like PUBLISH and a total cap (`MAX_LOBBY_CARDS`, 20,000). Listing is a separate contract,
  `peer/RendezvousLobbyTransport.js`, so identity lookup still cannot list anyone.
- `application/peer/PublicLobbyUseCase.js` joins on every configured server, renews cards while the app runs,
  and keeps the device discoverable while any lobby is joined, republishing as soon as a publication is spent.
  Those standing offers skip fetching a TURN credential (`publishSelf({ prepareRelay: false })`): the player
  asked that the relay be used only when needed, to save the monthly allowance. The person who clicks Connect
  may fetch one, and ICE relays only when no direct path works. Listings keep only cards that verify by their own
  signature and drop this identity and blocked ones; `connect()` is Find Someone by exact identity; `block()`
  derives the key from the did:key. Leaving never waits for an offer still being prepared; that offer withdraws
  itself when it lands.
- UI: `ui/components/PublicLobbyPanel.js`, on the Peers page (**Public Lobby**) and behind a **Lobby** button in
  World View. It shows who is listed, **Connecting…** until the handshake authenticates, then **Connected**.
  Joining lasts for the session and the page leaves every lobby on `pagehide`.
- Deliberately unchanged, as the player chose: a lobby connection is an ordinary authenticated peer, so the
  announcement index and publication sync run with a stranger as with anyone; `docs/Privacy.md` and the Peers
  guide now say so explicitly. Friendship still gates chat and voice.
- Four principles in `docs/principles/peers.md`: "A Rendezvous Answer Is Signed, And Readable Only By The
  Publisher", "A Lobby Card Says Who Is Present, Never Where To Reach Them", "The Lobby Is The Only Listing, And
  Only Of Those Who Join It", "A Standing Offer Never Spends A Relay Credential".
- Needs the new worker: a server from before this answers the lobby's requests with an unknown-type error, which
  the lobby reports as "does not offer a lobby yet", and the mailbox falls back to handing the reply over.
- Tests:
  - `server/rendezvous-worker/worker.test.js`: the mailbox (signatures, first answer wins, LOOKUP hides answered
    publications, only the publisher reads), lobby cards (signatures, per-lobby listing, replay and rollback,
    name and lifetime limits, leave), the listing and total caps, and the alarm sweeping expired cards.
  - `tests/RendezvousWorkerInterop.test.js`: the app's own signed answers and cards against the real worker.
  - `tests/RendezvousAnswerMailbox.test.js`: Find Someone and automatic Known Peer connection completing over real
    WebRTC with nothing copied, and the hand-over fallback for a locked identity.
  - `tests/LobbyCard.test.js`: lobby names, display-name normalization, lifetime cap, signing and verification.
  - `tests/PublicLobby.test.js`: strangers connecting over real WebRTC and the joiner staying reachable for a
    second one, no relay credential for standing offers, leaving (including mid-republish), a junk answer in the
    mailbox (the spent offer is closed and replaced at once, so the joiner is never stranded), World lobbies kept
    apart, blocked, forged and expired cards dropped, a locked identity, no server, an unreachable server and a
    server from before the lobby.

## Rendezvous answers pushed, not polled (unnumbered, 2026-09-27)

**A publisher waiting for someone to connect now gets the answer pushed down its open rendezvous connection
instead of polling for it every 2 seconds.** Polling was the main cost of the public lobby: every waiting device
sent 30 requests a minute to every server and kept its Durable Object from hibernating, so 1,000 people waiting
meant about 500 requests a second. It also added about a second, on average, before a connection could complete.

- Worker: FETCH_ANSWER takes `watch: true`. The signed request returns an answer already waiting, acknowledges
  with `watching: true`, and records the watch in the socket's attachment, which survives hibernation. When
  POST_ANSWER stores an answer, the worker pushes `{ type: 'ANSWER', identityId, publicationId, answer,
  answererId }` to the connections watching that publication and ends their watch. Only a connection whose watch
  carried the publisher's signature ever receives it, as FETCH_ANSWER already required. The rate limiter now
  merges into the attachment instead of overwriting it.
- Client: `WebSocketRendezvousTransport` raises pushed answers (`onAnswerPushed()`), `RendezvousDiscoveryProvider`
  keeps those for its own current publication (`onAnswer()`), `DiscoveryBootstrap` merges its providers, and
  `PeerSessionManager` completes the connection on whichever of push or check comes first, and only once. The
  first check runs as soon as it publishes, so the watch is in place before anyone can answer.
- Fallback: checks continue every 30 seconds while every server replied `watching: true`, to catch a push lost to
  a dropped connection, and every 2 seconds otherwise, so a server from before pushes still works.
- Result: about 2 requests a minute per waiting publisher instead of 30 (about 33 a second for 1,000 people), an
  idle Durable Object, and a connection that completes one round trip after the answer is posted.
- Tests:
  - `server/rendezvous-worker/worker.test.js`: a signed watch is acknowledged and stored beside the rate limiter,
    an unsigned one is refused, the answer is pushed to the watching connection only and ends the watch, a late
    watch returns the answer at once, a stale publication is not watched, and FETCH_ANSWER without `watch` is
    unchanged.
  - `tests/RendezvousWorkerInterop.test.js`: the app's client registers a watch with the real worker and receives
    the push.
  - `tests/RendezvousAnswerMailbox.test.js`: with checks an hour apart a connection still completes promptly,
    after exactly one check (the test fails when the push is ignored), and a network that never pushes is still
    polled at the frequent rate.

## Be Discoverable with a locked identity (unnumbered, 2026-09-27)

**Be Discoverable with a locked identity now says to unlock it, and a failed attempt no longer leaves a pending
peer behind.** Reported from a browser whose passphrase-protected identity was locked: the button answered
"RendezvousDiscoveryProvider: an invitation with no identityHint cannot be published", and every click added an
"Unknown peer · Connecting…" card to My Peers that nothing could ever answer.

- A locked identity cannot sign, so `DiscoverPeersUseCase#createInvitation()` built the invitation without an
  identity and the publish step refused it, after the WebRTC offer had already been made and registered.
- `PeerSessionManager#publishSelf()` now checks that the identity can sign before making an offer, with a message
  that says to unlock it, and closes the offer when publishing throws or publishes nothing (no rendezvous server).
  The public lobby, which publishes through the same method, benefits too.
- The Peers page disables **Be Discoverable** while the identity is locked and says why; the "no rendezvous
  server" message now points to Network Settings instead of a source file.
- Tests: `tests/PublishSelfGuards.test.js` (a locked identity, repeated tries, unlocking afterwards, an
  unreachable network, and no network, each leaving no pending connection). It fails on the previous code with
  the reported message.

## Share with Peers: published Worlds in a connected peer's Repository (unnumbered, 2026-09-27)

**A World published on one device can now reach the Repository of someone connected to it.** Reported after two
connected browsers kept separate Repositories: a plain Publish lists a World on its own device only, the connection
sync announces only the decentralized publication catalog, and a peer-announced envelope reaches the Repository only
after a manual Retrieve on the experimental Publications page, which did not fetch the World's snapshot either. There
was no product path to share a Repository entry with a peer at all.

- **Share with Peers** (`application/publication/sharing/SharePublicationWithPeersUseCase.js`, a button on the
  identity's own Repository cards) wraps the signed Publication in a signed DecentralizedPublication through
  `PublicationResolver#publish()`, catalogs it and announces it. Cataloging is what makes `forkbuild:content` serve
  the Publication's JSON and `PublicationPeerConnectionSync` announce it to later peers; the snapshot is already in the
  same content store from publishing. Sharing again reuses the envelope. Only the identity's own signed Publications
  can be shared.
- **Retrieval** (`RetrieveSharedPublicationUseCase`) resolves the envelope from connections authenticated as the
  sharer only (including their authorized devices), requires the Publication inside to be signed by the sharer, adds
  it to the Repository's discovery provider, and fetches its snapshot over `forkbuild:snapshot-content-transfer`, so
  **Explore** works. Content addresses are 32-bit FNV-1a, which a peer can collide, so no relay is ever a source.
- **Automatic for Friends and Known Peers** (`AutoRetrieveSharedPublicationsUseCase`): a share from a Friend or Known
  Peer who is not blocked is retrieved when it arrives or when its sharer reconnects. Anyone else's waits under
  **Shared with you** in the Repository (`ui/components/SharedWithYouPanel.js`) for a **Retrieve** click, the choice
  the player made: now that the lobby admits strangers, no stranger's connection may fill a device's storage.
- The Repository remounts its catalog when a World joins it while the page is open.
- The use cases take the Publication kind from `CreatePublicationDisplayKindRegistryUseCase`'s new
  `publicationKindPlugin`, keeping the rule that only the registry names that kind.
- Not changed, noted for later: World View shows its **My Publication** panel (with Unpublish and Distribute) for
  any Publication in the Repository, including one retrieved from a peer. That predates this change.
- Two principles in `docs/principles/publication.md`: "A Shared World Is Fetched Only From Whoever Shared It" and
  "Only A Trusted Sharer's World Is Retrieved Without Asking".
- Tests: `tests/SharePublicationWithPeers.test.js`: sharing only one's own World, idempotently, reaching peers that
  connect later; a stranger's manual Retrieve with the snapshot; automatic retrieval on arrival and on reconnection
  for a trusted sharer and never for an untrusted or blocked one; refusal when only a relay is connected; refusal of
  a World re-shared under another identity. The two security rules were each checked to fail the test when removed.

## Owner-only actions on World View's publication panel (unnumbered, 2026-09-27)

**World View's publication panel offers Unpublish and Distribute only on the viewer's own World.** It opens for any
Publication in the Repository, and since Share with Peers that routinely includes Worlds other people published: the
panel called itself **My Publication** and offered to unpublish or distribute someone else's World.

- `OwnPublicationPanel`'s new `isOwnPublication` is true when the signed-in identity signed the Publication, read from
  the session (`IdentityUseCase#currentSession()`, followed through `onSessionChanged`) so a locked identity still
  recognizes its own; an unsigned legacy Publication counts as the viewer's, since peers only share signed ones.
- Otherwise the panel is titled **Publication**, says only the publisher can unpublish or distribute it, and hides
  Unpublish, Distribute and the distribution dialog. `unpublishOwnPublication()`, `distributeOwnSnapshot()` and
  `distributeOwnPublication()` also refuse, so a direct call cannot bypass the hidden buttons. Placements, Snapshot
  tools, the share link and Commentary stay for everyone.
- Tests: `tests/OwnPublicationPanelOwnership.test.js` (ownership, including a locked identity, someone else's, signed
  out and legacy; the guarded methods; following the session). The three distribution tests that call the panel's
  methods on a stand-in context now declare that context the viewer's own (`isOwnPublication: true`).

## Be Discoverable looks for Known Peers too (unnumbered, 2026-09-27)

**Two Known Peers who both click Be Discoverable now connect.** Reported from two open browsers: each click only
published an offer and waited, because the automatic Known Peer connection (0.9.345) runs only at startup and when a
relationship changes, so neither side ever looked the other up.

- `FindPeerUseCase#publishSelf()` announces a success through a new `onPublished()`, and
  `AutoConnectKnownPeersUseCase` runs one pass on it: the person who clicks second finds the first. It remains one
  pass per click, never a timer, so the rendezvous operator still cannot watch a Known Peers list over time. The
  public lobby's frequent republishing goes to `PeerSessionManager` directly and triggers no lookups.
- Tests: `tests/RendezvousAnswerMailbox.test.js` adds two running Known Peers who connect once both have clicked
  Be Discoverable, with no lookup from a direct (lobby-style) publish; it fails when the new trigger is removed.

## World View panel layout, step 1 (unnumbered, 2026-09-27)

**World View's left panel now reads top to bottom as look, go, around, then your own tools.** An audit found it ran
about 2,000px in a 280px column, with publication management filling the first ~700px: on a 900px-tall screen, and on
a phone, Explore / Map / Places and everything below them started off-screen.

- New order: header (title, byline, status, Camera · Editing), then one utility row (Home, Locations, Notifications,
  👥 N online, Lobby), the Explore / Map / Places tabs, Nearby, inspection panels, Search, Avatar, the controls hint,
  and the publication section (`ui/views/worldView/templates/publicationSection.js`), with other Worlds in view last.
  The publication panel is still outside the Explore-only content, so it never depends on primary mode or a peer.
- Less repetition: the byline moved up under the title; the 👥 N online indicator is now the only Members button (it
  already opened the same panel); Worlds in View shows only when it lists a World besides the one in the header; the
  Nearby groups drop their repeated prefix (Places, Landmarks, People, Place Names, World Encounters).
- Things sit with what they act on: Explore Here / What's Here? open the Nearby section, and Move Placement renders
  beside Place through `OwnPublicationPanel`'s new `placement-actions` slot.
- The hover card (`templates/hoverCard.js`) floats over the viewport's bottom-right corner, so hovering no longer
  shifts the panel's content up and down.
- The publication panel had no styles of its own: its label/value lists used the browser's 40px indent and its
  buttons wrapped raggedly. It now has compact grids, a wrapping button row, and a heading styled like the rest.
- Tests: `tests/WorldViewPanelLayoutBrowser.test.js` mounts the real templates with Vue in Chromium (group titles and
  the camera queries in Nearby, Worlds in View's visibility, the hover card out of the panel, Move Placement beside
  Place, the placement grid). The browser runner's import map gains `vue` and serves CSS as `text/css`. Four tests
  that found the Place Names section by its old title, the commentary-surface allow-list, and the check that the
  publication panel is never nested in World Encounters follow the moved files.

## World View panel layout, steps 2 and 3 (unnumbered, 2026-09-27)

**World View's panel stops showing controls you can't use or rarely need, and Notifications moves to the app
header.** Follows step 1's reorder (above).

- Empty states: Places, Landmarks and People show only when they have something, with one line while all three are
  empty (Place Names and World Encounters always show; their emptiness is a discovery result of its own). Without an
  avatar of your own, the Avatar section shows only Show Other Avatars and the hint, not four disabled toggles and
  four disabled camera buttons.
- The publication panel shows Distribute and the share link up front; **More** holds Export Snapshot, Check Snapshot
  Match, Diagnostic Tools and Unpublish. Unpublish now asks once (`unpublishConfirming`, reset when the Publication
  changes). Export and Check stay on the primary screen, only folded, not moved into Diagnostic Tools: 0.9.324 kept
  that popup for the manual recovery pipeline, and these are ordinary checks on the active Publication. Their results
  render outside the menu. Commentary folds to "▸ Commentary (N)"; its body uses `v-show`, so the remote check still
  runs and the count stays current.
- Notifications is a 🔔 button in the app header beside the account, on every page (a text link in the nav wrapped
  it onto a second line at 1440px). ui/App.js hosts NotificationHistoryPanel
  through the new `application/chat/NotificationHistoryAccess.js` (composed in ui/main.js over the same storage World
  View's session uses; NotificationEventStore keeps no cache). Explore resolves the Publication the way
  `WorldNavigationSession#findPublicationById()` does; a mounted World View registers its `focusWorld()` so Explore
  moves within it, since a bare route change would not; elsewhere Explore routes to `/world/:documentId`. World View
  drops its own Notifications button, dialog and wrappers. Signed out, the panel now says "Sign in to view your
  notifications" without the use case's class name in front.
- The controls hint is behind a **?** button at the end of the utility row, readable when shown, instead of
  low-contrast text in the middle of the panel.
- Tests: `tests/NotificationHistoryAccess.test.js` (a real comment's notification read through a second store over
  the same storage, recipient-only; the signed-out message; Publication resolution through both providers; failure and no-identity cases).
  `tests/WorldViewPanelLayoutBrowser.test.js` adds the folded empty groups, the logged-out Avatar section, the More
  menu, Unpublish's confirmation and Commentary's fold. `tests/NotificationHistoryUILifecycle.test.js` checks the
  panel's wiring in ui/App.js instead of World View.

## Editor sidebar layout (unnumbered, 2026-09-27)

**The Editor's left sidebar shows only what can act on the current selection, and the selection tools sit above the
Build Library instead of below fifteen bricks.** Same approach as World View's panel layout (above).

- One contextual Selection panel (`ui/components/EditingSidebar.js`, which now renders `SelectionInspector` inside
  it) replaces the separate Selection, Transform, Groups and Clipboard sections. With nothing selected it shows a
  hint, Select All, Paste once the clipboard has something, and the group list; with bricks selected, Rotate,
  Duplicate, Delete, Copy, Paste, Color, Focus and Deselect, with three collapsed sections named for what they hold
  (Exact position & rotation; Align, distribute, repeat; Groups & blueprint) in place of three "Advanced" toggles.
  Previously about fifteen disabled controls showed with an empty selection.
- A StructurePlacement selection shows only StructureInstancePanel. The generic numeric panel used to render beside
  it, a second X/Y/Z/R form (with a Y the placement never takes) next to the instance's own X/Z/Rotation.
- Ambiguous labels: the selection's Clear is **Deselect**, the numeric panel's Clear is **Reset fields**, and the
  group buttons say "group" (Add to group, Delete group, …) so they don't read as acting on the selection.
- Document Information takes a `compact` prop: the Editor shows the title and an edit button, plus fork origin and
  the editability notice when they apply. The status row is left out because the toolbar's Saved / Unsaved indicator
  already shows it, except that a never-saved document gets a small Draft chip (the toolbar says "Saved" for it).
  World View keeps the full panel.
- The Place button stays highlighted while placing a structure (`PLACE_STRUCTURE`, `COMPOSE_STRUCTURE`), not only a
  brick.
- Bricks show as a two-column tile grid in five display sections (Basic, Structure, Roofs & Stairs, Openings,
  Details) via `groupBricksForDisplay()` in BuildLibraryPanel.js. Eleven of the fifteen bricks had a registry category
  to themselves; the sections are display only and `BrickDefinition.category` is unchanged. Both windows now sit
  together under Openings.
- The sidebar is 248px wide (was 220px). Its panels share `css/main/editor-sidebar.css` instead of inline styles, and
  the Align, Repeat and numeric buttons no longer use a monospace font.
- `EditorActionRegistry#onExecute()`: EditorView refreshes its action context after any action runs. Copy changes
  the clipboard and not the document, so Paste used to stay disabled after Copy until something else changed.
- Tests: `tests/EditorSidebarLayoutBrowser.test.js` (empty, brick and placement states, section titles, the numeric
  focus hook, no sideways overflow with every section open, the compact header against the full one);
  `tests/BuildLibraryUX.test.js` Section F (display sections over the real brick registry); `tests/EditorUX.test.js`
  Section E (`onExecute`).

## Peers page layout (unnumbered, 2026-09-27)

**The Peers page leads with what needs doing and the people you already have, shows each person once, and folds the
ways to connect into one tabbed panel.** Same approach as the World View and Editor layout passes (above).

- Order: a header with **Your ID** (and Copy full ID), **Needs your attention**, **People**, **Connect with someone
  new**, and a folded **Blocked (N)** that appears only when someone is blocked. The tools for meeting new people
  used to come first, and the people you already have last. The title is now "Peers", matching the nav.
- **Needs your attention** (`templates/attentionSection.js`) holds connections still in progress, as "step N of 5",
  with the reply box inline when one is waiting for the other side's reply, and incoming friend requests with
  Accept / Decline. It shows only when there is something. Reply text is kept per connection
  (`useConnectionFlow`'s `replyTexts`), so two waiting connections no longer share one box.
- **People** (`templates/peopleSection.js`, merged by `buildPeople()` in `peerConnections/people.js`) has one row per
  identity, merging Known Peers, current friends and live authenticated connections. It used to show up to three
  cards for one person. Connections are matched through `PeerPresenceUseCase#findConnectedPeers()` (new, the list
  form of `findConnectedPeer()`), so a friend on an authorized device lands on the friend's row. Tags (Friend,
  Remembered, Blocked, Revoked, Request sent, Wants to be friends), an online dot, one or two main actions (Chat,
  Reconnect, Add Friend), and a ⋯ menu (a native `<details>`) for the rest. Filters: All, Friends, Online. The three
  records stay separate; only the display merges.
- **Reconnect works for friends who were never remembered.** A Friends card had no Reconnect, only the text
  "Reconnect to unfriend". `PeerReconnectionUseCase` takes an optional `getFriendship` lookup and accepts a current
  friend as the expected identity (a pending request does not qualify). The identity check is unchanged, a
  friend reconnect never remembers them, and `onReconnectRejected` now also carries `target`.
- **One name per person.** Rename edits the Known Peer alias; for someone not remembered, **Name & Remember** does
  both, building the `PeerIdentity` from their live connection or friendship record (a `PeerIdentity` refuses an
  identityId that doesn't match its key). The separate per-connection "Local alias" field is gone.
- **Connect with someone new** (`templates/connectSection.js`): tabs for Invite, Paste an invitation, Find by ID
  (with Be Discoverable) and Public lobby. "Add a Candidate", which looked identical to Connect to Peer, is now
  "Save an invitation for later", folded under Find by ID. Invite, Paste and Reconnect share
  `peerConnections/InvitationExchange.js`, where Reconnect used to repeat the whole flow nested inside its card.
- Copy: six explanatory paragraphs become one-line hints and a "How this works" link to the user guide. The Blocked
  paragraph no longer names a source file (`core/PeerBlockRecord.js`). An action's error shows on the row it came
  from, or above the list if that row is filtered out.
- Styles in `css/main/peers-page.css`; unused rules for the old page are removed from
  `identity-publications-and-peers.css`.
- Tests: `tests/PeersPageLayoutBrowser.test.js` (the real view over fake use cases: section order, one row per
  person, Reconnect and Name & Remember for a never-remembered friend, Add Friend, Accept and Finish Connecting
  from the attention list, filters, tabs, no sideways scroll at 390px with a menu open); `tests/PeersPeopleList.test.js`
  (`buildPeople()`, including a friend online from another device); `tests/PeerConnectionResilience.test.js` adds
  reconnecting a friend, the identity check on it, and refusing a pending request.

## Choosing who can place a publication (unnumbered, 2026-09-27)

**A publisher can now choose that only they may place their publication in the World.** Until now, placing a
Publication had no permission check at all (`placePublication()` called it "an open product decision"), so anyone
who held a build could place a copy of it anywhere in their own World.

- `core/PlacementPolicy.js` (new): `PlacementPolicy.ANYONE` (`'anyone'`, the default) and `PUBLISHER_ONLY`
  (`'publisher-only'`), `evaluatePlacementPermission()` and `PlacementNotPermittedError`. The placer is compared by
  did:key with the Publication's `publisherIdentity`, or by name for an unsigned legacy Publication. A value this
  version doesn't know is treated as publisher-only, so a newer, stricter setting is never read as permission.
- The setting lives on `DocumentMetadata.placementPolicy`, is chosen in **Document Properties** ("Who can place it
  in the World") and shown in the Document Information panel. `LocalPublisherProvider` copies it onto the
  Publication, inside the signed payload, so it can't be stripped or loosened without breaking the signature.
  Both the metadata and the Publication write it only when it isn't the default, so existing documents keep their
  content hash and existing Publications keep their signatures. Forks start from the default (the new author
  chooses for themselves); importing an exported document keeps it.
- Enforced where placements come into being: `PlacePublicationUseCase` throws `PlacementNotPermittedError` (and
  `checkPermission()` answers ahead of time); `ReplicaMergeService` takes an optional `findPublicationById` and
  rejects a peer's placement the policy doesn't allow (`REJECTED`, reason `PLACEMENT_POLICY`); Claimed Builds get a
  new `ClaimedBuildAcceptance.PUBLISHER_ONLY` state, so Accept Position is disabled with a reason instead of
  failing on click.
- Like the license's fork permission, this binds honest clients only; the docs say so plainly. New principle:
  "A Publisher Decides Who May Place Their Publication".
- Docs: `docs/Protocol.md` (the optional field on the document envelope and the Publication, and the placement-record
  rule), `docs/Architecture.md`, `docs/user/04-PublishingAndForking.md` ("Choosing who can place it") and
  `docs/user/03-WorldView.md` (Accept Position, and "Why can I place other people's builds?").
- Tests: `tests/PublicationPlacementPolicy.test.js` (the default and its serialization, signing and tamper
  detection, who may place, `PlacePublicationUseCase` refusing and writing nothing, merge rejection, the Accept
  Position state, the Document Properties dialog, and forks versus imports).
  `WorldCreationPublicationLifecycleProductReassessment` now lists `placementPolicy` in DocumentMetadata's expected
  fields.

## Placing is not copying: wording (unnumbered, 2026-09-27)

**World View and the docs stop calling a placement a "copy".** A placement is a signed pointer to one unchanged
Publication; only a fork is a copy. Calling both "copy" blurred the difference that the placement setting above
depends on.

- The Placements panel's **Place Copy Here** is now **Add Placement Here**, and its rows, tooltips and remove
  confirmations say "placement" (`ui/components/ownPublicationPanel/templates/placementsSection.js`). The
  confirmations read "Placed at …" and "Placement removed from World" (`useOwnPublicationActions.js`).
- The placement setting reads **Anyone may place it**, and Accept Position's hint says it places the build "with a
  placement signed by you" rather than "your own copy".
- `docs/user/03-WorldView.md` gains a **Placing vs forking** note (a table of what each creates, who's the author,
  and which setting controls it), and its placement sections use the same terms. `04-PublishingAndForking.md` links
  to it.
- Tests updated for the new labels: `PlaceCopyHereDuplicateGuard`, `WorldViewPanelLayoutBrowser`,
  `PublicationPlacementRowActions` and `PublicationPlacementPolicy`.

## Signatures bind the key to the did:key (unnumbered, 2026-09-28)

**A signed record can no longer be passed off as someone else's.** `LocalAuthorizationVerifier#verifyDescriptor()`
checked a signature against the public key the record carried and that the signature's `signer` equalled the carried
`id`, but never that the key was the one the did:key `id` encodes. So anyone could sign a Publication with their own
key, set `publisherIdentity` to `{ id: <someone else's did:key>, publicKey: <their own key> }`, and have
`verifyPublication()` report it as validly signed by that person.

- Affected: every verifier that checks a record against an identity it carries. `verifyPublication()`,
  `verifyPlacement()`, `verifyDecentralizedPublication()`, `verifyPublicationAnchor()` and
  `verifyPublicationSnapshotPlacement()`. The others rebuild the key from the signer's did:key and were never
  affected; peer authentication already made this check itself.
- Fix: `identity/Ed25519.js#publicKeyMatchesDidKey()` (new), checked inside `verifyDescriptor()` so every current and
  future caller gets it; a mismatch is refused with reason "public key does not match identity".
  `PeerAuthenticationSession` now uses the same helper.
- This change doesn't go back over records a device verified and stored before it.
- New principle: "A did:key Names Its Key". Docs: `docs/Protocol.md` ("Signatures").
- Tests: `tests/VerifierDidKeyBinding.test.js` (the binding helper; a forged Publication and a forged placement
  refused; genuine ones, and an attacker signing honestly as themselves, still valid).
## Publisher placements travel with Snapshots (unnumbered, 2026-09-28)

**Other people now see a build where its publisher put it.** Placement records never left the device that made
them, so a walker saw someone else's build either as an unverified ghost at its announced `claimedPosition`, or at
its deterministic fallback spot. Those differed whenever the publisher had moved it, and a build set to **Only I may
place it** could then never appear at the publisher's real position for anyone else.

- `core/SnapshotDiscoveryEnvelope.js`: an optional `placementRecord` beside `claimedPosition`, the publisher's signed
  PlacementRecord. It is kept only when it names the same Publication at exactly the claimed position; otherwise it
  is left out and the claim stands. `snapshotCandidateFromEnvelope()` replaces the field-by-field copies in the Nostr,
  Arweave (two) and Steem query services and the Announcement Index sync. Readers that predate it ignore it.
- Sending: World View's `placementClaimFor()` announces the publisher's own signed placement
  (`getPublisherPlacementRecord()`, the most recently updated one this device holds signed by the Publication's
  publisher) and its position; without one it falls back to the old unsigned claim. `snapshotDistributionCommand`,
  `executeSnapshotDistributionCommand` and the three `publish()`s pass it through. The Remote IPFS path, which
  announced no position at all, now announces the same claim.
- Receiving: `application/placement/AdoptPublisherPlacementUseCase.js` (new) adopts a record into the placement
  registry only when the Publication is known here, the record's owner is the Publication's `publisherIdentity`
  (same id and key, and the did:key encodes that key), its integrity holds, and its signature verifies against the
  Publication's key rather than the key the record carries. A higher revision of the same placement replaces a lower
  one; a placement held for another owner is never replaced. `useClaimedBuilds` offers every candidate's record and
  retries ones whose Publication is unknown when a reconcile finds it known (after **Verify**, a share or an
  encounter). The ghost then yields to the real placement.
- It deliberately doesn't use the retired peer-replication merge (`ReplicaMergeService`): one signer's revisions need
  no vector-clock conflict handling, and `HistoricalPlacementReplicationBoundaryAudit` keeps that family unwired.
- The Announcement Index and `SnapshotCandidateDiscoveryQueryService` add the record's own hash to their dedup keys,
  so a later revision (the publisher moved it) is kept beside an earlier one instead of dropped as a duplicate.
- New principle: "A Position Counts Only When Its Publisher Signed It". The placement-policy principle added the day
  before no longer names peer merging as a live path. Docs: `docs/Protocol.md`, `docs/AnnouncementIndex.md`,
  `docs/Architecture.md`, and both user guides.
- Tests: `tests/PublisherPlacementAnnouncement.test.js` (the envelope, the index keys, adoption including a forged
  key, a tampered position, a later move and a late older revision, which record gets announced, and World View
  retrying once the Publication is known). Updated for the new source shapes: `ArweaveSnapshotDiscoveryQueryService`,
  `DistributeExistingClaimedPositionThroughSnapshotDistribution` and `SnapshotDistributionRuntimeComposition`.
- Not done: the Editor's post-publish **Distribute** still announces no position, as before.

## Content hashes are SHA-256 (unnumbered, 2026-09-28)

**A forged build can no longer pass as someone else's signed Publication.** A Publication's signature covers its
`contentHash`, not its bytes, and the content hash was 32-bit FNV-1a, which has no secret and can be run backwards:
three chosen characters in any text field made any build match any hash, in about 15 ms. Anyone who could supply bytes
for a hash (announcing a Snapshot under a victim's hash, a gateway, a Steem node, a pinning service, or a connected
peer, lobby strangers included) could show a different build under the author's name and valid signature. Reported
privately as GHSA-8ggw-xpjf-w4rh.

- `serializer/contentHash.js`: `computeContentHash()` is now SHA-256 over the text's UTF-8 bytes (64 hex characters),
  through the vendored noble-hashes. `computeFnv1a32()` is the old function under its own name.
  `contentHashMatches(text, hash, { allowLegacy })` picks the algorithm from the hash's length, never from a field an
  attacker could set, and refuses text with lone surrogates.
- `core/ContentReference.js#verify()` refuses an FNV-1a hash unless the caller passes `allowLegacy`, and decodes bytes
  as strict UTF-8 without dropping a byte-order mark, so different bytes can't decode to the same text. It is strict
  by default, so a path that forgets to choose fails closed.
- Legacy hashes are honored only for this device's own data: `LocalPublisherProvider#isOwnPublication()` (same id and
  same hash as one of its own records) lets World View keep loading Publications made here before the change, and
  crash-recovery checkpoints written by the previous version still recover. Someone else's legacy Publication is
  refused with a message saying its author needs to publish it again.
- Content stores, the Steem manifest and new Publications record `algorithm: 'sha256'`. Equivocation and replay
  checks for presence and profiles use SHA-256.
- FNV-1a stays, under its own name, where values must not change and a signature covers the real data: the
  deterministic grid position (every unplaced build would otherwise move), PlacementRecord's own hash and a
  Signature's `signedHash` pre-check (stored records keep verifying), and blueprint fingerprints.
- Hashes are 32 bytes, which still fits a Bitcoin OP_RETURN; peer protocols already accepted up to 128 hex characters.
- New principle: "A Hash That Binds A Signature Must Resist Collisions". Docs: `docs/Protocol.md` ("Document
  envelope"), `docs/Architecture.md`, `docs/DeveloperFAQ.md`, `docs/ReleaseNotes-1.0.md`.
- Tests: `tests/ContentHashCollisionResistance.test.js` forges an FNV-1a collision for a real document and checks it
  is refused by `ContentReference`, by `StoreSnapshotContentUseCase` (which stored it before the change) and under a
  legacy hash; that malformed UTF-8, a BOM and lone surrogates are refused; that new Publications use SHA-256; that
  this device's own legacy Publication and recovery checkpoint still load while someone else's is refused; and that
  grid positions are unchanged. Two tests that asserted an 8-character hash now expect 64.
- Not done: the Editor and Publications page don't yet offer to re-publish a legacy Publication, and blueprint
  fingerprints stay FNV-1a. The mock `SigningIdentity#sign()`/`verify()` used by the unwired delegation code is still
  a mock and must be replaced before delegation is wired.
## World View's Home key goes home (unnumbered, 2026-09-28)

**The Home key in World View now does what the Home button does.** The user guides said it returned the camera and
avatar to your own world, but World View's renderer carried the Editor's camera-reset shortcut, so the key snapped the
camera to (10, 10, 10) looking at the map origin, usually thousands of units from your world, and left the avatar
where it was.

- `renderer/CameraController.js`: a `resetKey` option (default `Home`); `null` turns the reset shortcut off.
  `renderer/Renderer.js` passes a `cameraResetKey` through, and `application/world/RenderWorldViewUseCase.js` sets it
  to `null`. The Editor keeps its reset.
- `ui/views/worldView/useViewportInput.js`: an unmodified `Home` outside a text field calls the same `goHome()` as the
  button, and prevents the page scroll.
- Docs: `docs/user/03-WorldView.md` names the key; `docs/user/ControlsReference.md` also corrects World View's
  undo/redo, which does have `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` / `Ctrl/Cmd+Y` bindings.
- Tests: `tests/WorldViewHomeKey.test.js` (Home goes home; not in a text field or with a modifier; other keys still
  reach Avatar Control Mode) and `tests/CameraResetKeyBrowser.test.js` (the reset shortcut by default, and off with
  `resetKey: null`).
- Not done: the Editor's reset still fires while a text field has focus, where Home should only move the cursor.

## Split the Publications guide; Bitcoin wallet on the page (unnumbered, 2026-09-28)

**The Bitcoin wallet can now be connected without an existing anchor.** **Connect Bitcoin Wallet** only appeared
inside an existing Bitcoin anchor's card, and **Create Bitcoin Anchor** never succeeds, so someone with no anchor
received from a peer could never reach the Bitcoin pipeline.

- `ui/views/decentralizedPublications/templates/anchoringToolsTab.js`: a page-level **Bitcoin Wallet** card above
  **Bitcoin Funding**, like **Base Network**, checked against Bitcoin mainnet (the connection view already was).
  `anchorEvidenceList.js` no longer repeats it inside each Bitcoin anchor's card.

**`docs/user/09-PublicationsAndEvidence.md` is now four guides.** It had grown to about 23,000 words, half of all the
user docs, with Network Settings (not experimental) buried in it.

- 09 keeps the overview: where claims come from, the Publications page (now with a map of each card's Distribution
  section and details tabs, and the History tab's Cross-Domain Timeline, which wasn't documented), Commentary, Local
  Snapshot, Decentralization, and what survives a reload.
- New `10-NetworkSettings.md`, `11-EvidenceAndStorage.md` (evidence, the Bitcoin and Base pipelines, Snapshot
  Placements, IPFS publishing, Steem) and `12-ArchiveAndLeaderboards.md`. Together about 11,000 words, rewritten
  in plain statements. Links from the other guides point at the moved sections.
- Corrections found on the way: the Proof / Anchoring Provider page also offers Steem, and Historical Bitcoin
  Anchor Evidence is in the Blockchain Anchoring tab.

## Blueprint fingerprints are SHA-256 (unnumbered, 2026-09-28)

**A different design can no longer take over someone's signed authorship or lineage claims.** Signed attribution and
lineage claims name a design only by its fingerprint, which was `"bp:"` plus 32-bit FNV-1a of the canonical design.
Three characters in a description made any design match any fingerprint in about 13 ms, so Alice's signed "I made
this" showed on Mallory's design, and the import check against "the design on file" passed. The content-hash fix
earlier the same day left fingerprints on FNV-1a because every stored claim is signed over its fingerprint; this entry
is that transition. Part of GHSA-8ggw-xpjf-w4rh.

- `core/BlueprintFingerprint.js`: `deriveBlueprintFingerprint()` is `"bp2:"` plus SHA-256 (64 hex characters).
  `deriveLegacyBlueprintFingerprint()` gives the old `"bp:"` value, only to find claims made under it.
  `isCurrentBlueprintFingerprint()` and `isLegacyBlueprintFingerprint()` tell them apart by prefix and length.
- Views: `BlueprintAttributionUseCase#communityView()` and `BlueprintLineageUseCase#lineageView()` add
  `legacyClaims`, the claims under the design's old fingerprint. They are never counted as authors or shown as
  lineage, because a different design can share that fingerprint.
- Re-signing: `communityView()` also gives `myLegacyClaim`, and `resignLegacyAttribution(structure)` signs this
  identity's authorship under the current fingerprint and retracts the old claim. It runs only when a person clicks
  **Re-sign for this design** in the Structure info panel, which says how many older claims there are: the app never
  re-signs on its own, since a forged design that matches the old fingerprint would otherwise get signed. A lineage
  claim involves two designs, so it is declared again with **Derived from this**.
- Imports: `BlueprintAttributionExchange`, `BlueprintLineageExchange` and the attribution publication kind refuse any
  claim whose fingerprint isn't current, with a message saying its author needs to sign it again. Blueprint files
  still import; their older bundled claims are left out, and the import message says how many.
- Docs: `docs/Architecture.md`, the fingerprint principle (short version and a "Changed by" note), the Editor guide
  and the release notes.
- Tests: `tests/BlueprintFingerprintCollisionResistance.test.js` forges a design with Alice's old fingerprint and
  checks her old claim counts for neither design; that she can re-sign it for her own design only, after which she is
  the author and the forged design still has none; that old attributions are refused from files and from the network;
  and that old lineage claims are counted apart, refused on import, and replaced by declaring the lineage again.
  `tests/BlueprintIdentityAttribution.test.js` now expects `"bp2:"` fingerprints.

## Delegations are signed for real (unnumbered, 2026-09-28)

**The delegation code no longer trusts a signature anyone can write.** `core/SigningIdentity.js` was a placeholder from
0.2.17 whose `sign()` produced the text `mock-sig-<publicKey>-<hash>` and whose `verify()` compared that text, so
anyone who knew a public key (which is public) could "sign" a delegation in its owner's name. Only the delegation code
used it, and delegation isn't wired into the running app, so nothing live was exposed; this removes the trap before it
is.

- `core/SigningIdentity.js` is deleted. `core/Delegation.js` uses the real public-key `identity/SigningIdentity.js`,
  and gains `getSigningDescriptor()` (signature type `delegation`) and `withSignature()`.
- `CreateDelegationUseCase(resolver, identityProvider)` signs through `signCanonical()`; the issuer is always the
  provider's own identity.
- `identity/DescriptorSignature.js` holds the one Ed25519 descriptor check (moved unchanged from
  `LocalAuthorizationVerifier#verifyDescriptor()`, which now calls it) and `identityForDidKey()`.
  `LocalAuthorizationVerifier#verifyDelegation()` and `VerifyDelegationUseCase` use it with the issuer's key taken
  from its did:key; `DelegationVerifier#verify()` takes the action's `descriptor` and `signature` instead of a raw
  payload and checks both the action and the delegation that way.
- Tests: `tests/DelegatedAuthorization.test.js` is rewritten on real identities, keeping its 15 cases, and adds
  forgeries: the old `mock-sig-…` format, a delegation in Alice's name signed by Bob, Alice's did:key paired with Bob's
  key, a stored delegation changed after signing, and a delegation signature replayed as an action's. It used to end
  in `runTests().catch(console.error)`, which reported success even when an assertion failed; it now uses top-level
  `await`. `tests/TrustDiscoveryHardening.test.js` sections 13 and 17 use real identities.
- Still needed before delegation is wired in: a way for grants to travel between devices, signed revocation, a nonce
  check against replay, and a decision on chains (refused today). `docs/Architecture.md` lists them.

## Release 1.1.0 (unnumbered, 2026-09-28)

**Version 1.1.0 is released.** Everything since 1.0.0 ships under its own version number, so the two security
advisories for 1.0.0 can name a patched version: GHSA-8ggw-xpjf-w4rh (forgeable content hashes and blueprint
fingerprints) and GHSA-73v7-4rm7-r8jc (signatures not bound to the signer's did:key). Both list 1.0.0 and earlier as
affected and 1.1.0 as patched. It is a minor release rather than a patch because it also adds features (IndexedDB
storage, the compact document format, touch controls, the public lobby, share links, background discovery and
Steem).

- `package.json`, `package-lock.json` and `core/version.js` (shown on the About page and stamped into new documents
  as `engineVersion`) say 1.1.0. `PROTOCOL_VERSION` is unchanged.
- `docs/ReleaseNotes-1.1.md` is new: the two security fixes first (SHA-256 content hashes and blueprint
  fingerprints, and the did:key binding), then what's new, fixes, upgrading from 1.0.0 and known limitations. The
  "Since 1.0.0" list in `docs/ReleaseNotes-1.0.md` was missing the did:key fix, the layout work, the Home key fix and
  the Bitcoin wallet on the Publications page; it moved to the new file and now points there. The README names 1.1.0
  and links both.

## Following people (unnumbered, 2026-09-28)

**You can follow someone to keep up with their work, as on X, without either side asking the other for anything.**
Friendship is mutual and exists to authorize chat, voice and visibility; there was no way to say "show me what this
person makes" without that. Following is that: private, one-sided, and granting the followed identity nothing (the
principle "Following Is A Local Subscription, Never A Relationship").

- Store: `core/FollowRecord.js` and `application/identity/FollowUseCase.js`, kept per signed-in identity under
  `follows:<identityId>`. Only a did:key can be followed, never a typed author name, and never yourself. Nothing is
  signed or sent.
- Feed: `application/publication/FollowingFeed.js` lists the Repository's admitted Publications whose signature
  verifies against a followed, unblocked identity, newest first. `ui/views/FollowingView.js` (`/following`, **Following**
  in the top bar) shows the people you follow, with **Unfollow**, and that feed. It fetches nothing by itself.
- Notifications: `DecentralizedPublicationDiscoveryProvider#onAdded()` is new; `FollowedAuthorPublicationNotifier`
  listens to it, after the startup rebuild, and saves a `publication.followed-author-published` notification.
  `core/NotificationDeduplicationPolicy.js` deduplicates that event type by `publicationId` instead of
  `commentaryId`, so a Publication heard of again never notifies twice.
- Announcement Index: an `isKeptFirst` option. `FollowedAnnouncementRetention.js` keeps Snapshot records carrying a
  followed publisher's signed placement, and Place Naming claims a followed author signed, ahead of the rest when a
  tag is full, after checking the signature. Publication leads carry no author and get no preference. This was listed
  as not built in `docs/AnnouncementIndex.md`.
- Shared Worlds: a followed identity counts as a trusted sharer for `AutoRetrieveSharedPublicationsUseCase`.
- UI: `ui/components/FollowButton.js` on publication cards, on the Author view (one per verified signing identity
  under that name), in the Peers page's ⋯ menu with a **Following** tag and filter, and as **Follow Their Work** in
  World View's Avatar Info Panel. That panel's camera button now reads **Follow Avatar** / **Stop Following Avatar**,
  so the two follows can't be confused. Remote avatar info carries `signerIdentityId`, the verified presence signer,
  rather than the unverified `ownerIdentity`.
- Not built: a public, signed follow list (as Nostr's contact lists), follower counts, and a per-author discovery tag
  so following could fetch an author's history from relays.
- Tests: `tests/Following.test.js`. `tests/support/MinimalVueCompositionApiShim.js#mountComponent()` takes props.

## A shorter Publications page (unnumbered, 2026-09-28)

**The Publications page lists publications that failed their check in one folded group of short cards, and every
card's sections start folded.** Since content hashes became SHA-256, every publication made before then fails with
"Content does not match its own reference". On a device with twenty of those, each card still opened a full
Distribution section (about a dozen buttons to announce, place and anchor content that can't be checked), so the page
ran to dozens of screens, and the batch-anchor picker offered all twenty.

- `ui/views/DecentralizedPublicationsView.js`: `failedCheck(entry)` is true once a check ends in anything but
  Available or Content unavailable (an unsupported kind included). `usableEntries` get the full card as before;
  `failedEntries` go in a folded "N publications that can't be used" group (open when nothing usable is listed), each
  card showing its status, the reason, the content hash and **Re-check** only. Nothing is stored; a Re-check that
  succeeds moves the card back.
- The "no peer" notice at the top shows only when some publication could be retrieved. The intro is shorter. The
  per-card "Snapshot, Anchoring, IPFS & Evidence Details" disclosure is now called **Details**; its tabs already say
  what's inside.
- `templates/distributionSection.js`: Distribution is folded by default, as `docs/user/09-PublicationsAndEvidence.md`
  already said. The Bitcoin/Base hint names the tab that holds those steps instead of repeating the disclosure's long
  name.
- `templates/snapshotTab.js`: one "no peer" notice for the three peer sections instead of one each; with no peer
  connected, those sections show only results they already have.
- `useBatchAnchoring.js` takes `isAnchorable`: the picker lists, **Select Unanchored** picks and a batch anchors only
  usable publications, since an anchor of a hash that can't be checked proves nothing.
- Tests: `tests/PublicationsPageLayoutBrowser.test.js` renders the page with real Vue; `tests/SteemBatchAnchoringUI.test.js`
  covers a failed publication being left out of a batch.

## No anchors for old hashes, removing failed publications, and titles (unnumbered, 2026-09-28)

**Nothing is anchored or placed under a legacy content hash, failed publications can be removed from this device,
and Publications page cards and the batch-anchor picker show real names.** Follows "A shorter Publications page"
above, which only hid the anchoring buttons for failed publications.

- Anchoring: nobody can check bytes against an FNV-1a hash, so a record of one proves nothing.
  `LEGACY_HASH_EXTERNAL_REASON` (serializer/contentHash.js) is the refusal everywhere, each time before a publisher,
  wallet or store is asked: `CreateExternalPublicationAnchorUseCase#execute()` and `#executeBatch()` return
  PUBLISH_REJECTED (a batch holding one legacy hash is refused whole); `BitcoinAnchorTransactionConstructionCoordinator`
  and `BasePublicationTransactionPlanCoordinator` return FAILED; `BitcoinAnchorPublicationCoordinator#publishAnchor()`
  returns PLAN_FAILED; `BaseAnchorPublisher#publish()` returns `published: false`. `CreatePublicationAnchorUseCase`
  throws as a backstop, so no anchor naming one is ever signed. Anchors received from peers or imported are not
  affected.
- Placement: `CreateExternalSnapshotPlacementUseCase` throws before its integrity check. This device can still read its
  own legacy content, but nobody who fetched the placed bytes could check them.
- Removing: each card in the "can't be used" group has **Remove from This Device**, and the group has **Remove All N
  from This Device**, each confirmed inline. They call `LocalPublicationCatalog#remove()`, which is local only; a peer
  that still has the publication may announce it again. Only failed entries can be removed.
- Names: `publicationTitle(entry)` reads a checked Publication's `title` or a place name claim's `name` (shortened past
  80 characters). A card leads with it and moves the content kind to the line below; picker rows start with it.
  Unchecked, unavailable and failed entries, and blueprint attributions, keep the content kind.
- Tests: `tests/LegacyContentHashAnchoringRefusal.test.js` drives each refusal with collaborators that fail if called.
  `tests/PublicationsPageLayoutBrowser.test.js` covers Remove, Remove All, Cancel and the names. Ten anchoring tests
  used 8-hex sample hashes, which are the legacy format; they now use 64-hex ones.

## Your own old publications say how to publish them again (unnumbered, 2026-09-28)

**On the Publications page, a publication that one of this device's identities signed, and that failed only because
of its old FNV-1a hash, is listed first in the "can't be used" group with a Yours badge and the steps to publish it
again, instead of "its author needs to publish it again".** The 1.1 release notes say publications made with 1.0.0
still open on your device; that is about the Repository's own records (`LocalPublisherProvider#isOwnPublication()`),
not these catalog envelopes, whose content is read from a store that also holds bytes received from peers.

- Deliberately not changed: `PublicationResolver` still refuses every legacy hash, yours included. The store can't
  tell your bytes from a peer's, so accepting "own" legacy content would reopen the forgery the SHA-256 change closed.
- `isOwnLegacyEntry(entry)` in `DecentralizedPublicationsView.js`: failed with CONTENT_HASH_MISMATCH, a legacy hash,
  and a publisher id among `identityUseCase.listIdentities()` (read again with every list refresh). The envelope
  signature is checked before the hash, so that id is genuine. Without `identityUseCase`, nothing is marked as yours.
- The advice is per kind, so it lives beside each kind's `describe()` in
  `CreatePublicationDisplayKindRegistryUseCase` as `republishAdvice`: a World is published again and shared (link to
  the Repository), a blueprint attribution is re-signed and published (link to the Editor), a place name is published
  again in World View (no single page to link). The page reads it through `republishAdviceFor(kindPlugin)` in
  `decentralizedPublications/presentation.js`, which gives a kind without advice a generic sentence, and stays free of
  content-kind names as `tests/PublicationDisplayKindIntegration.test.js` requires.
- Tests: `tests/OwnLegacyRepublishAdvice.test.js`; `tests/PublicationsPageLayoutBrowser.test.js` covers the order,
  the badge, the advice and the link, and that other people's cards get none of it.

## Test files wait for their own tests (unnumbered, 2026-09-28)

**Every test file now awaits the async work it starts at top level, and both runners refuse one that doesn't.**
479 of the Node test files ended with `run();` or `run().catch(...)`. Importing such a file resolves before `run()`
finishes, which `tests/support/RunTestFile.mjs` takes as "the test is done": once nothing is left to wait on it ends
the process, with a pass if nothing had failed yet, even though later checks never ran. That is how
`tests/IdentityEventErrorBoundaryAudit.test.js` passed on `main` with an assertion that no longer held (fixed
in #1263); whether it passed depended on timing.

- Each of those 479 calls is now `await run(...)`. The full suite passes with every file running to its end, so no
  other test had been hiding a failure this way.
- Guard: `tests/support/UnawaitedTopLevelWork.mjs` finds a column-0 call to a function the file declares async
  (`async function name(` or `const name = async`) that isn't awaited. `tests/run.mjs` and `tests/run-browser.mjs`
  fail such a file without running it, naming the line. Synchronous `run();` calls are left alone: they finish before
  the import does.
- Docs: `docs/CodingConventions.md` and `docs/DeveloperFAQ.md` state the rule for Node files too (it was written only
  for browser tests).
- Tests: `tests/UnawaitedTopLevelWork.test.js` drives the detector on sample sources, then runs `tests/run.mjs` on a
  scratch file to show the refusal end to end.

## The Publications page's tools move below the publications (unnumbered, 2026-09-28)

**Wallet, Archive & Publisher Tools, the folded panel of page-wide tools, is now at the bottom of the Publications page
instead of above the list,** so the publications come first. Most of it (Base network observation, three kinds of
archive records, fingerprints) is for experts.

- It stays on the same page, not a route of its own: the per-publication Bitcoin and Base steps use the wallet
  connection and funding observed in that panel, all held by the page's component, and a separate route would drop
  that state on every navigation between the two.
- `openPublicationsTools(tab)` opens the panel on a tab and scrolls to it (the panel's `open` is now bound to
  `publicationsToolsOpen`). The page intro links to it, and the Bitcoin and Base transaction-plan steps, which said
  "observe wallet funding above", now link to it instead.
- Tests: `tests/PublicationsPageLayoutBrowser.test.js` checks the panel comes after the publications and the failed
  group, starts folded, and that the intro's link opens it on Blockchain Anchoring.

## Distribution leads with your preferred provider (unnumbered, 2026-09-28)

**In a Publications card's Distribution section, Content and Proof / Anchoring each lead with one button for the
provider you saved under Configure, named for it (Store on IPFS, Anchor on Steem), and fold every other provider's card
under "Other … options".** Opened, the section used to show a card per storage backend and per anchor type (up to
seven buttons) with a long Bitcoin/Base note, even for someone who had already chosen where their content and anchors
go.

- Nothing is chosen for the person: the button only ever uses their own saved preference, through the existing
  preferred-provider coordinators, and every other provider stays one click away. With nothing saved, or a saved
  provider that can't be used with one click, the cards show open, as before, and a line says why.
- `preferredDistributionChoice(savedKey, availableKeys, { walletGuidedKeys })` in
  `decentralizedPublications/presentation.js` decides: the Content preference must be one of
  `preferableStorageTypes()` (so never Local, nor IPFS Remote Pinning, which needs an endpoint each time), and the
  anchoring preference one of the available anchor types other than `WALLET_GUIDED_ANCHOR_TYPES` (Bitcoin, Base), which
  are made through their wallet steps in Details. The view reads both preferences once from `roleProviderPreferenceStore`
  when it opens.
- The anchoring "Use Preferred Provider" button is replaced by "Anchor on …" in the same place; the Content one stays in
  Details → Placements & IPFS, now joined by "Store on …" in Distribution. Announcement / Discovery is unchanged: its
  substrate picker is already seeded from the saved preference.
- Tests: `tests/PreferredDistributionChoice.test.js`; `tests/PublicationsPageLayoutBrowser.test.js` covers a usable
  storage preference (button, folded options, the click reaching the preferred trigger), a Bitcoin anchoring
  preference (no button, options open, hint), a Steem one, and no storage preference.

## Your own old Worlds open in the Editor from the Publications page (unnumbered, 2026-09-28)

**A World you shared before content hashes became SHA-256 now has its own title and an Open in Editor link on its
Publications card, instead of a generic Open Repository.** With 19 such cards, "find the World in the Repository
yourself" meant guessing which card was which.

- Why the page couldn't say which World it was: the World's id is inside the entry's wrapped content, and that
  content is read only after it matches the entry's hash, which an old FNV-1a hash can't vouch for.
- `FindOwnSharedPublicationUseCase` (`application/publication/sharing/`) answers without trusting those bytes. It
  reads them from this device's content store only as a claim of which Publication (id and snapshot hash) they wrap,
  and returns `{ publicationId, documentId, title }` from this device's own record with exactly that id and hash,
  through the new `LocalPublisherProvider#findOwnPublication()` (which `isOwnPublication()` now uses). Bytes from
  anyone else can at most point at one of this device's own Worlds, and never supply the title or the World id. It
  names no content kind, as `tests/PublicationDisplayKindIntegration.test.js` requires; bytes of another kind match
  no record. `CreateFindOwnSharedPublicationUseCase` wires it to the same storage `CreatePublisherUseCase` publishes
  into, and `ui/main.js` provides it as `findOwnSharedPublicationUseCase`.
- The view looks up each of your own old entries once, after its check, and links to `/editor?load=<documentId>`,
  as the Repository's Open does. Other people's entries are never looked up. Without a record (the World was
  unpublished since), the card keeps the kind's own advice and Open Repository.
- The entry itself is still refused, as before: the new link only helps you publish the World again.
- Tests: `tests/FindOwnSharedPublication.test.js` (found, tampered bytes ignored beyond id and hash, every no-match
  case, `findOwnPublication()`); `tests/PublicationsPageLayoutBrowser.test.js` covers the title, the Editor link,
  that only your own entries are looked up, and the fallback.

## The Publications page is a regular feature, with Experimental parts (unnumbered, 2026-09-28)

**The Publications page no longer shows the route-wide Experimental banner or the Exp. badge in the top bar; instead it
marks its own Experimental parts.** An audit of each feature on the page found that the list and its checks, cleaning
up failed publications, announcing on Nostr or Arweave, storing on IPFS or Arweave, and a card's local snapshot
(Check, Import, Get from Peer) rest on the same verifiers and peer layer as the stable core. Anchoring, the
wallets, Steem (built 2026-09-26 and never run against a live node from this environment), remote pinning and the expert
tabs and tools don't yet, and stay Experimental.

- Graduated: `/publications` loses `meta: { experimental: true }`; `ui/App.js` drops its nav badge (and
  `.experimental-badge--nav`, now unused). A line under the intro says what the badges mean.
- Marked Experimental on the page: the Proof / Anchoring block; Steem and IPFS (Remote Pinning) wherever offered
  (a badge on a card, "(Experimental)" in an option; storage types through `EXPERIMENTAL_STORAGE_TYPES` and
  `storageTypeOptionLabel()` in `decentralizedPublications/presentation.js`); the
  Decentralization & Evidence, Placements & IPFS and History tabs (**Exp.**); the Snapshot tab's Acquisition, Peer
  Snapshot Possession, Comparison and Snapshot State sections; and the Wallet, Archive & Publisher Tools panel.
- Removed a button that never worked: **Create Bitcoin Anchor** ran the one-click Bitcoin publisher, which
  `ui/main/composeAnchoring.js` deliberately wires to a broadcaster that always reports unavailable. The card now
  lists only `oneClickAnchorTypes()` (neither Bitcoin nor Base) and says Bitcoin and Base anchors are made through
  their wallet steps. The publisher stays registered, since the Proof / Anchoring Provider page offers Bitcoin.
- Fixed: Distribute Snapshot announced on the saved Announcement/Discovery provider but always said
  **Nostr: Announced** and linked **Configure Nostr**. The card now has its own Substrate picker (seeded from that
  preference), passes it to `snapshotDistributionCommand`, and names the substrate this attempt used. The Remote IPFS
  publish's badge is named for the provider its announcement went to as well.
- Fixed: on a World's card, Distribute Snapshot distributed the envelope's content (the Publication record) as if it
  were the World's snapshot, with no Publication id or position. It now distributes the World's own snapshot
  (the wrapped Publication's `contentReference`) with its publisher's signed placement when this device holds one,
  as World View does. `application/placement/PublisherPlacementClaim.js` (new) holds
  `latestPublisherPlacementRecord()`, now also used by World View's `getPublisherPlacementRecord()`, and
  `PublisherPlacementClaimLookup`, provided as `publisherPlacementClaimLookup` by
  `CreatePublisherPlacementClaimLookupUseCase`. Other kinds are still announced by content hash alone.
- Fixed: a relationship between zero claims read **Agreement** ("Agreement · 0 known placements").
  `describeClaimRelationship()` says **Nothing to compare yet** in Snapshot State, the Decentralization card and the
  placement convergence line.
- Docs: README, `docs/user/01`, `09`, `11`, `12`, the user README and FAQ, `docs/Privacy.md` (Nostr, Arweave and IPFS
  reads are no longer marked experimental), `docs/Architecture.md` and `docs/DeveloperFAQ.md` (marking part of a page).
- Tests: `tests/PublicationsPageExperimentalParts.test.js` (one-click anchor types, relationships, labels, the
  placement lookup and World View picking the same record); `tests/PublicationsPageLayoutBrowser.test.js` covers the
  badges, the missing Bitcoin card, and Distribute Snapshot on a World and on another kind.
- Not done: running Steem against a live node, and creating its monthly threads twelve months ahead, both needed
  before Steem can graduate. The one-click Bitcoin publisher itself is left in place.

## Back up your data (unnumbered, 2026-09-28)

**A new Your Data page backs up everything ForkBuild keeps in this browser to one encrypted file and restores it;
documents and structures export all at once; an exported identity carries its lifecycle records; and the Repository
marks publications that exist only on this device.** An audit of browser storage found every store writes through one
StorageProvider keyspace (IndexedDB `forkbuild`, or `forkbuild:` localStorage keys), and that clearing site data
deleted documents, recovery checkpoints, identities with their revocations and device grants, structures, your own
publications (Publish stores them locally only), claims you authored, peers, friends, follows, chat, avatar and
settings, with only single documents, single blueprints and single identity keys exportable. One full backup covers
all of it; per-view buttons were added only where moving one kind of thing on its own is useful.

- `application/backup/BackupEntryGroups.js` names every store's key or prefix and the kind of data it holds.
  `DeviceBackupUseCase` collects every entry except `local-session` (other people's `content:` only on request, your
  own publications' content always), and restores by replacing everything or by adding what's missing (keeping this
  device's entry where both have one, and combining `forkbuild-index`, `local-identities` and
  `forkbuild-publications`), writing only names it knows, then waits for `flushLocalStorage()`.
  `DeviceBackupFile` is the `.forkbuild-backup` format: a magic line, a JSON header, and gzip-compressed JSON
  encrypted with AES-256-GCM under PBKDF2-SHA256 (600,000 iterations), the header as additional data
  (docs/Protocol.md, "Device backup").
- `ui/views/YourDataView.js` at `/settings/data` (**Your Data** in the top menu): what's stored by kind,
  `navigator.storage.estimate()`, a request for persistent storage, Back Up to a File, and Restore (open, preview,
  choose merge or a confirmed replace, then reload, since every store read its data at start-up).
- Editor: **Export All Documents** at the bottom of Recent writes a `forkbuild-document-bundle`
  (`application/document/DocumentBundle.js`); the toolbar's **Import** reads it, saving documents under their own id
  when nothing is stored there, skipping identical ones, and saving a copy beside a different version. The Toolbar
  takes `savedDocumentsRevision` to re-read Recent. **Export All** beside My Structures writes a
  `forkbuild-blueprint-bundle` (`application/blueprint/BlueprintBundle.js`); **Import Blueprint** reads it through
  `EditorSession#importBlueprintIfNew()`, which skips a design whose fingerprint is already in My Structures.
- Identity export adds `lifecycle` (revocation, succession, device authorizations) through
  `identity/IdentityLifecycleTransfer.js`; import verifies each record and stores those the device lacks, for a new
  identity and for one already there, and reports them as `restoredLifecycle`. Before, re-importing a revoked identity
  after clearing data showed it as active.
- `application/publication/LocalOnlyPublicationCheck.js` (provided as `localOnlyPublicationCheck`): an own
  publication with no uploaded Signed Claim material and no IPFS or Arweave placement of its content. Repository cards
  say **Only on this device**, linking to Your Data.
- Principles: new "A Device Backup Is Always Encrypted, And A Restore Never Logs Anyone In"; "An Imported Document
  Always Gets A Fresh Identity" and "Duplicate Identity Import Is A No-Op, Never A Silent Overwrite" amended.
- Docs: README, `docs/user/13-YourData.md` (new), `02`, `04`, `05`, the user README and FAQ, `docs/Privacy.md`,
  `docs/Architecture.md` ("Backup and restore", identity export) and `docs/Protocol.md` (document and blueprint
  bundles, identity `lifecycle`, device backup).
- Tests: `tests/DeviceBackup.test.js` (grouping, collection, the file's encryption and authenticated header, merge,
  replace, an identity unlocking after a restore); `tests/YourDataPageBrowser.test.js` (the page in Chromium: summary,
  backup download, wrong passphrase, merge, confirmed replace, reload, phone width);
  `tests/ExportAllDocumentsAndStructures.test.js`; `tests/IdentityExportLifecycleRecords.test.js`;
  `tests/LocalOnlyPublicationCheck.test.js`. `tests/PublisherPerformanceLeaderboardUi.test.js` counts thirteen top-nav
  links.
- Not done: a reminder when no backup has been made for a while, and backing up to anywhere but a downloaded file.

## Backup reminders, folder and share destinations (unnumbered, 2026-09-28)

**ForkBuild now reminds people who haven't backed up for a while, can back up to a folder (by click or automatically
once a day) and can share a backup to another app.** The first backup milestone ended with a downloaded file only, and
nothing prompting anyone to make one.

- `application/backup/BackupStatusStore.js`: `device-backup-status` (last backup date and destination, the first day
  the device held work, reminder interval, snooze, automatic backups, the last automatic failure). It joins
  `local-session` in `DEVICE_ONLY_ENTRY_NAMES`: never backed up or restored, kept by a replacing restore, which records
  the backup's date (`DeviceBackupUseCase#restore({ createdAt })`).
- `application/backup/BackupReminder.js`: `backupReminderDue()` (a week after work first appears if never backed up,
  then after 7/14/30/90 days or never, silenced by a snooze) and `holdsUserData()` (documents, identities, structures,
  peers or chat). `ui/components/BackupReminderBanner.js` shows it under the header except on Your Data, with Back Up
  Now (one-click to the folder when possible, otherwise Your Data) and Remind Me in a Week.
- `DeviceBackupFile#deriveBackupEncryptionKey()` / `encodeDeviceBackupWithKey()`: a non-extractable, encrypt-only
  key remembered for backups that don't ask for the passphrase. `storage/IndexedDbValueStore.js` keeps it and the
  folder handle in a separate `forkbuild-backup` database, since neither is JSON.
- `application/backup/BackupFolder.js` (one file a day, keeps ForkBuild's newest ten, removes nothing else) and
  `BackupDestinations.js` (choose/forget folder, remember/forget key, back up to the folder asking for permission
  right after the click, `runAutomatic()` that never asks), started by `startAutomaticBackups()` in `ui/main.js`.
- Your Data: Share Backup… (Web Share with a file; a slow encryption keeps the file for a second tap), Back Up to
  "folder", "Remember the backup key", and a Reminders and automatic backups section (last backup, interval, folder,
  the daily automatic backup, Forget Backup Key).
- Principles: new "A Remembered Backup Key Can Only Make Backups".
- Docs: README, `docs/user/13-YourData.md`, the FAQ, `docs/Privacy.md`, `docs/Architecture.md` and `docs/Protocol.md`.
- Tests: `tests/BackupReminderAndDestinations.test.js` (status store, reminder policy, snooze, device-only entries,
  the remembered key, the folder's daily files and pruning, destinations, automatic backups, scheduling);
  `tests/BackupDestinationsBrowser.test.js` (Chromium, with real IndexedDB and a directory handle from the origin
  private file system: choosing a folder, remembering the key, one-click and automatic backups across sessions, the
  two-tap share, and the banner).
- Not done: backing up to peers or to IPFS or Arweave. Peers would need a storage agreement and quotas nobody
  enforces, and public storage would keep a passphrase-protected copy of every private key open to offline guessing
  forever.

## Repository cards say where a publication was distributed (unnumbered, 2026-09-28)

**Your own publications' Repository cards now say where this device recorded distributing them ("Stored on IPFS ·
Announced on Nostr"), replacing "Only on this device".** The old note claimed something this device can't know: a
distribution made from another device, or a Distribute Snapshot (whose result nothing kept past a reload), left it
showing on a publication that did exist elsewhere. A positive statement of what was recorded is never false in that
way; with no record, the card says "No distribution recorded on this device".

- `application/publication/OwnPublicationDistributionRecord.js` (replaces `LocalOnlyPublicationCheck.js`, provided as
  `publicationDistributionRecord`): `describe(publication)` returns null for anyone else's publication, otherwise
  `{ stored, announced }`, one entry per kind (IPFS, Arweave, Steem; Nostr, Arweave, Steem) with its locator or
  announcement id. Sources: the Signed Claim's distribution lifecycle (material storage or URI scheme; discovery origin
  through `substrateOfOrigin()`), signed snapshot placements, and the new log.
- `application/snapshot/OwnSnapshotDistributionLog.js` (`own-snapshot-distributions`, backed up with your
  publications): one entry per content hash, storage and substrate. `ui/main/composePublicationDistribution.js` logs
  every completed `snapshotDistributionCommand`, so the Editor's dialog, World View and the Publications page all
  record their snapshot distributions.
- `ui/components/PublicationCard.js`: the line, with each name's locator or announcement id as its tooltip (no link,
  so looking never contacts a gateway); the "No distribution recorded" line keeps the link to Your Data.
- Docs: README, `docs/user/13-YourData.md`, `04`, the user README and `docs/Architecture.md`.
- Tests: `tests/OwnPublicationDistributionRecord.test.js` (origins, the log, describing publications from each
  source, and the composed command logging a Distribute Snapshot); `tests/LocalOnlyPublicationCheck.test.js` removed.
- Not done: checking that a recorded upload is still available, and learning about distributions made from another
  device.


## Wandering wildlife (unnumbered, 2026-09-29)

**Deer and rabbits now wander slowly around where the world placed them, pausing, turning and walking, instead of
standing frozen.** Motion is sampled from time exactly as placement is sampled from space, so it needs no storage,
no simulation and no networking: everyone looking at the same spot at the same moment sees the same animals there.
An audit of the animal code before this change found three systems (the renderer, collision and catching) each
asking separately where an animal was, agreeing only because nothing moved; they now share one formula and one clock.

- `core/WildlifeMotion.js`: `animalPoseAt(seed, animal, time)` and `wildlifeInRegionAt()`. Per-species segments
  (deer 14 s, rabbits 7 s, offset per animal) of pause, turn, then an eased walk between hashed waypoints. Waypoints
  stay inside the animal's lattice cell and its species' wander radius (deer 3, rabbits 2), and one off its zone or
  in a river falls back to the spawn point. Staying in the cell keeps the tile partition, ids and catch exclusion
  unchanged.
- One clock: `WorldNavigationSession`'s `wildlifeClock` (wall-clock seconds) goes to `Renderer`,
  `AvatarWildlifeConstraint`, `AvatarAnimalInteractionController` and `AnimalRuntimeInstances#sync()`, which now
  refreshes wild animals to their current pose. Catching reads wild animals from a fresh query, never a stale
  tracked copy.
- Rendering: wildlife tiles keep their animals and `updateWildlifeTileMesh()` rewrites instance matrices each frame
  (no rebuild, no extra draw call); bounding spheres are padded so a wandering animal is never culled while in view.
- Fixed: a caught animal kept an invisible collider at its spawn point for the rest of the session; collision now
  skips caught animals.
- Fixed: the runtime store saved every tracked animal, so after a reload wild animals came back as "released" copies
  drawn beside the real ones. Only released animals are saved now, and wild ones in an old save are skipped
  (`core/AnimalIdentity.js#isDeterministicAnimalId()`).
- Fixed: streamed tiles were removed from the scene but never disposed, so GPU memory grew while roaming.
  `TerrainStreamingController` takes a `disposeTile` hook (`renderer/TileDisposal.js`): terrain and water tiles free
  their geometry and material, vegetation and wildlife tiles only their instance buffers.
- Principles: new "A Wild Animal Wanders On A Path Sampled From Time, Never Simulated"; "An Animal Has Three
  Possible Homes" notes the change.
- Docs: `docs/user/03-WorldView.md`, `docs/user/06-AvatarsAndPresence.md` and `docs/Architecture.md`.
- Tests: `tests/WildlifeMotion.test.js` (determinism, staying in the cell and wander radius, continuous position and
  heading, standing only on valid ground, region queries and tile partition while moving);
  `tests/WildlifeMotionIntegration.test.js` (collision at the current pose and the caught-collider fix, catching,
  store refresh, session persistence, tile updates and bounding spheres, tile disposal). The wildlife collision
  flagship test now runs on a frozen clock.
- Not done: released animals and decorations still stand still; no walk or hop animation (the animal glides; added
  below); motion never reacts to avatars, which would make replicas disagree.

## Wildlife walk animation (unnumbered, 2026-09-29)

**Wandering animals no longer glide: rabbits hop and deer step along, nodding their heads.** No legs or new
geometry: the gait is carried by the body and head transforms the wildlife tiles already rewrite every frame.

- `core/WildlifeMotion.js`: `animalPoseAt()` also reports `gaitPhase`, the strides walked so far in the current walk
  (0 when standing). Each species has a `strideLength` (deer 1.0, rabbit 0.5); a walk takes a whole number of
  strides, rounded down so a stride is never shorter than the species' own and the cadence never flutters, and the
  phase follows the eased walk's progress, so the gait speeds up and slows down with the animal and every walk ends
  exactly on a stride boundary. Walks shorter than one stride (1% of rabbit and 3% of deer walking time) shuffle.
- `renderer/AnimalGait.js`: `gaitOffsetsAt(species, gaitPhase)` → `{ lift, bodyPitch, headPitch }`, zero at every
  whole stride. A rabbit hop is an arc (0.16 high) with the nose tipping up on take-off and down on landing; a deer
  step raises the body slightly twice per stride and nods the head (0.22 rad) in time.
- `renderer/WildlifeTileMesh.js`: body and head matrices are now written separately; the head nods about a
  per-species `neckPivot` set back inside the body, so it swings on a neck-length arm. At rest the head still shares
  the body's transform. Collision and catching only read x/z, so they are unaffected.
- Docs: `docs/user/03-WorldView.md`, `docs/Architecture.md`.
- Tests: `tests/AnimalGait.test.js` (rest at whole strides, hop and step shapes, continuity at 60 fps over real
  walks, lift/pitch/nod applied in the tile with the neck staying attached); `tests/WildlifeMotion.test.js` checks
  gaitPhase counts forward while walking, is 0 standing, and ends each walk on a whole stride.
- Not done: legs (would change every animal's resting look and add a draw call per species per tile); idle
  animation such as grazing (added below); released animals and decorations.

## Wildlife idle animation (unnumbered, 2026-09-29)

**Standing animals no longer freeze between walks: deer graze with their muzzles in the grass or lift their heads
and look around, and rabbits nibble or sit up on their haunches.** Like the walk, it needs no new geometry and no
extra draw calls, and every replica sees the same animal doing the same thing at the same moment.

- `core/WildlifeMotion.js`: a new `IDLE_ACTION` vocabulary (NONE, GRAZE, ALERT) and per-species `idleChances` (deer
  55% graze, 25% alert; rabbits 50%, 30%; the rest just stand). `animalPoseAt()` picks one action per pause from
  (seed, cell, segment) and reports `idleAction`, `idleSeconds` and `idleDuration`. The idle window runs from arrival
  to the turn before the next walk, so an action never overlaps turning or walking; a window under 1.5 s is spent
  standing.
- `renderer/AnimalIdle.js`: `idleOffsetsAt()` turns the action into body lift and pitch and head pitch and yaw, eased
  in and out over 0.7 s so every pause starts and ends at rest. A grazing deer lowers its head 0.45 rad and chews; an
  alert deer raises it and slowly looks side to side; a rabbit nibbles at 4 Hz, or sits up (body pitched back 0.5 rad
  and lifted so its rump stays on the ground) and glances about.
- `renderer/WildlifeTileMesh.js`: walking animals take gait offsets and standing ones idle offsets; the head now also
  turns (yaw) about its neck pivot.
- Docs: `docs/user/03-WorldView.md`, `docs/Architecture.md`; the wandering principle's full text covers idling.
- Tests: `tests/AnimalIdle.test.js` (one action per pause, only while standing, over before the turn, at the
  species' odds; rest at both ends; continuity at 60 fps through walks, pauses and the moves between them; a grazing
  head lowered but above the ground, a sitting rabbit's rump on the ground). `tests/AnimalGait.test.js` and
  `tests/WildlifeMotionIntegration.test.js` now expect a standing head to move with idling while staying attached at
  the neck.
- Not done: released animals and decorations still stand still; idling never reacts to avatars (replicas would
  disagree); tail flicks and ear twitches (no tails or ears are modeled).

## Released animals and decorations idle; ears and tails (unnumbered, 2026-09-29)

**Released animals and animal decorations no longer stand frozen: they graze, look around and turn in place. And
every animal now has ears and a tail** — long upright ears and a cotton tail for rabbits, ears held out to the
sides and a short cocked tail for deer.

- `core/WildlifeMotion.js#stationaryAnimalPoseAt(seed, animalKey, species, time)`: the idle-in-place counterpart of
  `animalPoseAt()`, keyed by id (FNV-1a) instead of a lattice cell. Same per-species segments: one `IDLE_ACTION`
  per pause, then a 1.2 s turn in place to a new heading. These animals never wander: their Y is authoritative and
  can be the top of a structure, so a wander could leave them in mid-air. A decoration's id is World content, so
  every replica sees it doing the same thing.
- `renderer/AnimalRenderer.js` builds a small joint graph (`BODY_FRAME` → body, `NECK` → head), still two meshes;
  `AnimalVisual#animateAt()` drives it with `renderer/AnimalIdle.js`'s offsets, matching exactly how
  `WildlifeTileMesh.js` composes instance matrices. `AnimalFieldRenderer#animate()` and
  `WorldRenderer#animateDecorations()` run every frame on the new `Renderer#wildlifeTime()`, wired by
  `RenderWorldViewUseCase` and, for decorations in the Editor, `RenderWorldUseCase`.
- Ears and tails: small low-poly ellipsoids merged into the shared `SPECIES_PRESET` head and body geometry (a local
  merge helper; no new vendored file). They nod, hop and graze with what they are attached to, cost no extra mesh or
  draw call, and reach released animals and decorations through the same presets.
- Docs: `docs/user/03-WorldView.md`, `docs/user/06-AvatarsAndPresence.md`, `docs/Architecture.md`; the wandering
  principle's full text covers animals that stay put.
- Tests: `tests/StationaryAnimalIdle.test.js` (idle and turn in place per id, one action per pause, smooth turns,
  determinism; the joint graph at rest and animated matching the tiles' composition exactly; per-frame drivers never
  moving an animal; merged geometry well-formed, ears above the head, tail on the rump).
- Not done: ears and tails don't twitch on their own (they would need their own instanced mesh: one more draw call
  per species per tile); a decorated animal is keyed by its new decoration id, so it may turn to a new heading the
  moment it is decorated; animals don't react to avatars.

## Animals watch your avatar (unnumbered, 2026-09-29)

**Come near an animal and it turns its head to watch you: a grazing deer stops and lifts its head, and a rabbit
sits up if you get close.** Only your own avatar is watched, and only on your screen; no animal ever moves because
of you, so where it is (and so collision and catching) stays the same for everyone.

- `renderer/AnimalReaction.js#reactToObserver(species, offsets, pose, x, z, observer)`: applied after the gait or idle
  offsets in all three draw paths (wildlife tiles, released animals, decorations). Stateless: a pure function of the
  observer's position, the animal's position and its pose.
  - Distance: fades in inside the look radius (deer 8, rabbits 5), full within 60% of it.
  - View: an animal only sees what is in front of it; the reaction fades out toward directly behind, so the head
    never whips from one shoulder to the other as you cross behind it. The head turns at most 1.3 rad (deer) or
    1.1 rad (rabbit) on its neck.
  - Posture: the head turns while walking too, but lifting it (and a rabbit within 3 sitting up in its alert pose)
    only happens as far as the animal is settled in its pause (`idleEnvelope()`), so starting or ending a walk never
    snaps.
- `Renderer#setWildlifeObserver()` / `wildlifeObserver()`: `RenderWorldViewUseCase` hands it the local avatar's drawn
  position, whether or not "show my avatar" is on (a hidden avatar still walks and collides). Never a remote avatar
  (their positions arrive late, so reactions would not match what their owners see); no observer in the Editor.
- Docs: `docs/user/03-WorldView.md`, `docs/user/06-AvatarsAndPresence.md`, `docs/Architecture.md`; the wandering
  principle's full text covers reacting to the viewer.
- Tests: `tests/AnimalReaction.test.js` (the look radius and view cone, the neck's limit, continuity circling and
  approaching an animal and over a minute of real walks and pauses with an avatar nearby, grazing interrupted and
  rabbits sitting up only while settled, every draw path, and positions never changing).
- Not done: fleeing or any other change of position (would make players disagree about where an animal is);
  reacting to other players' avatars; looking up or down at the avatar's height.

## World Residents (unnumbered, 2026-09-29)

**A World can have residents: people who live there and stroll around the spot they call home, walking round
buildings, trees and water rather than through them. When one is standing and you come near, it turns to face you,
and it waves when you walk up to it.** A World's author adds one by standing where it should live and pressing `R`
(or the Avatar panel's **Add Resident Here**); it is World content, saved, published and forked with the World.

- `core/WorldResident.js`: `{ id, worldId, authorIdentityId, position }`, the position being the resident's home
  (World-local, y always 0). `World#addResident()`/`removeResident()`/`getResident(s)()`, `RESIDENT_ADDED`/`_REMOVED`
  events; `toJSON()` writes `residents` only when there is one, so other Worlds serialize byte for byte as before.
  `DocumentValidator` checks the field. `CreateWorldResidentCommand`/`RemoveWorldResidentCommand`, registered.
- `core/ResidentMotion.js#residentPoseAt(resident, time, { isClear })`: sampled from time and keyed by id, like a
  wild animal (16 s segments, 1.1 m/s, 6 m wander radius). A waypoint is home unless home can see it; a walk goes
  straight when clear and by way of home (turning in place there) otherwise, so each segment depends only on
  (id, k) and the World.
- `core/ResidentPath.js#isResidentWalkClear()`: brick footprints and tree trunks against the resident's 0.3 radius,
  and dry, walkable ground all along. `application/world/ResidentRuntime.js` gathers each home's obstacles from
  `AvatarMovementConstraint#obstaclesNear()` (new: the bricks an avatar on the ground bumps into) and
  `treeCollisionGeometryInRegion()`, refreshed every 2 s one resident at a time, with each answer memoized.
- Rendering: `renderer/ResidentFieldRenderer.js`, an `AvatarVisual` per resident (at most 16, nearest first), dressed
  by `core/ResidentAppearance.js` from its id in an earthy palette; legs advance with the ground covered.
  `renderer/ResidentReaction.js#residentFacingFor()`: stateless, a settled resident within 6 turns to face the local
  avatar, fading out toward its back; one wave per approach within 3.5. Never in `remoteAvatarVisuals`, so never
  picked, listed or hidden as a player.
- Collision: `AvatarResidentConstraint`, last in `AvatarMovementController`'s pipeline, at the session's
  `wildlifeClock`; skipped when the avatar is up on something.
- Session: `application/worldNavigation/residentMethods.js` (`addResidentHere()`, `removeNearestResidentHere()`,
  `toggleResidentHere()`, `residentInteractionState()`, the `R` key, per-frame `syncResidents()`). Adding is refused on
  a rooftop, in water or while riding; a new resident's id is chosen so it appears standing at the avatar's feet.
  UI: the Avatar panel's Residents row and a `[R] Remove Resident` prompt.
- Docs: `docs/user/03-WorldView.md`, `docs/user/06-AvatarsAndPresence.md`, `docs/user/ControlsReference.md`,
  `docs/Architecture.md`, `docs/Protocol.md`, `docs/CapabilityMatrix.md`, README; a new principle, "A Resident Walks
  A Path Sampled From Time And The World, And Is Never A Person".
- Tests: `tests/WorldResident.test.js` (value object, World, envelope and validation, commands and replay, forks),
  `tests/ResidentMotion.test.js` (determinism, bounds, continuity over an hour, walls never crossed, detours by way
  of home, path checks, appearance, noticing the viewer), `tests/ResidentIntegration.test.js` (runtime, a real brick
  wall, avatar collision, the session's add/remove/refusals/undo/key/rendering hand-off, the field renderer and its
  wave).
- Not done: a resident never reacts to anyone with its path (no stepping aside, following or fleeing — replicas would
  disagree); no walking indoors through doorways (a door narrower than the resident's reach from home is just a
  wall); residents on rooftops or bridges; choosing a resident's look, name or wander radius; a touch-pad button
  (the Avatar panel's button works on touch); the Editor doesn't draw residents.

## Residents tell you what's around (unnumbered, 2026-09-29)

**Stand beside a resident and press `T` (or tap Talk), and it tells you about its neighbourhood in a speech bubble:
a vehicle or an animal nearby, a landmark, someone who's around, the place it lives in, or another build some way
off — "About 3.6 km to the north-east, there's a build called “Hill Fort” by bob."** Talk again and it moves on to
something else. It points at what exists; it never sets a goal, a quest or a reward.

- Principles: "Exploration Guides Attention, Never Ownership or Mutation" (0.3.9) gets a *Changed by* note — its "no
  NPC guides" means no character that sets tasks, and a resident saying what's around is allowed. The residents
  principle gets the same note, and a new principle states the rule: "A Resident Tells You What's Around, Never What
  To Do".
- `core/ResidentTalk.js`: facts to sentences. `describeDistance()` rounds ("just a few steps", "about 80 m",
  "about 3.6 km"), `compassWord()` names the sector, `sanitizeSpokenText()` strips control and bidi-override
  characters, collapses whitespace and caps length (60 for titles, 40 for names). `composeResidentRemarks(facts,
  { turn })`: one nearby sentence (kinds take turns by nearest, the place last; a kind coming round again names its
  next-nearest) and one build sentence (nearest three take turns); `QUIET_REMARK` when there is nothing.
- `application/world/ResidentSurroundings.js#gatherResidentFacts()`: the replica's own view from the resident's
  position — vehicles (150 m; stored ones and the ridden one left out, moved ones where they are now), animals
  (100 m; caught ones left out, released ones in), landmarks (1 km), present people by shown name (500 m), other
  builds from the location search (5 km; not its own World or its parent), and the region it stands in.
- Session: `talkToNearestResident()`, `lastResidentSpeech()`, `setResidentDisplayNameResolver()`, the `T` key, and
  `canTalk` in `residentInteractionState()`. A per-resident turn counter is kept in the session only.
- Rendering: `renderer/ResidentSpeechBubble.js` draws the words as canvas text on a sprite over the resident's head
  (sRGB, not tone-mapped); `ResidentFieldRenderer#say()` shows it for 5–14 s by length, and hides it when you walk
  beyond 8 m or the resident leaves view. The facade's `showResidentSpeech()` passes it through.
- UI: `[T] Talk · [R] Remove Resident` prompt, Talk buttons in the Avatar section and the touch pad, and a
  screen-reader `aria-live` announcement ("A resident says: …").
- Docs: `docs/user/06-AvatarsAndPresence.md`, `docs/user/03-WorldView.md`, `docs/user/ControlsReference.md`,
  `docs/Architecture.md`, README, the principles above.
- Tests: `tests/ResidentTalk.test.js` (rounding, directions, sanitizing, each kind's sentence, turns moving on,
  nothing imperative; never a stored or ridden vehicle or a caught animal; builds deduplicated and never its own
  World; the session's T key, rotation and hand-off to the renderer; the bubble's lifetime and walking away), and the
  Avatar panel's Talk button in `tests/WorldViewPanelLayoutBrowser.test.js`.
- Not done: residents don't mention placed structures inside loaded Worlds by title unless the catalog knows them as
  builds; no voice (text only); no talking in the Editor; what a resident knows isn't limited by what it "could have
  seen" — it is the viewer's knowledge.

## Residents name placed structures; Focus on what they mention (unnumbered, 2026-09-29)

**A resident now also mentions structures placed in the World around it ("“Old Mill” by carol stands about 40 m to
the north."), and while its words are up a Focus button appears for each thing it mentioned that stays put, to swing
the camera over for a look.**

- Structures: `_residentFactsAround()` collects every loaded World's `StructurePlacement`s (300 m), named by
  `_residentStructureName(documentId)`: a known publication's title and author (`findByDocumentId()`), else the
  title this device saved the document under, else nothing — a bare document id is never spoken. New
  `RESIDENT_FACT_KIND.STRUCTURE`, one of the nearby kinds that take turns.
- Focus: `pickResidentRemarkFacts()` (what `composeResidentRemarks()` now speaks) and `focusTargetsFor()` for the kinds
  in `FOCUSABLE_FACT_KINDS` (vehicles, landmarks, structures, builds — not animals or people, who move on). Every
  gathered fact now carries its `position`. `lastResidentSpeech()` adds `focusTargets`, `spokenAt` and `seconds`;
  `speechSecondsFor()` moved to `core/ResidentTalk.js` so the bubble and the buttons agree.
  `focusResidentMention(index)` is the camera-only `focusPosition()` at the ground there: the avatar stays put and the
  active World is unchanged.
- UI: `ui/components/ResidentSpeechActions.js`, bottom-center above the prompts, shown on touch screens too, while the
  speech is current and the viewer is beside that resident.
- Principles: the talking principle gets a *Changed by* note — the viewer may choose Focus; a resident's words never
  move the camera by themselves.
- Also: `core/ResidentTalk.js` and its test spelled the invisible direction-override characters they strip as literal
  characters; they are `\u` escapes now.
- Tests: `tests/ResidentTalk.test.js` Section E (structure sentences, turns, focus targets and what never gets one,
  structures within reach, naming by publication or saved title and never by id, Focus through `focusPosition()` on the
  ground without moving the avatar or changing the World); `tests/WorldViewPanelLayoutBrowser.test.js` (the Focus row).
- Not done: Focus on people (they move; the People list's Follow already covers them).

## Ambient sound in World View (unnumbered, 2026-09-29)

**World View was silent. It now plays quiet background sound that follows the land around you — wind on high and
rocky ground, birdsong in forests, crickets in fields and grassland, lapping at a lake, running water by a river —
fading as you walk from one kind of land to another. `M` or the Sound button turns it off; a slider sets the
volume.**

Why this first: an audit of what World View already knows found that ecology zones and rivers are pure functions of
place, which is exactly what a background soundscape needs, and that everything could be synthesized with Web Audio:
no audio files to download or license, no new server, no Content Security Policy change and no new library.
Footsteps, vehicles, animals, residents and Editor sounds are later phases, built on the same provider.

- Mix: `core/AmbientSoundscape.js#ambientMixAt(seed, x, z)` weighs each zone's level per layer underfoot and on rings
  at 12 m and 30 m; `isRiverAt()` adds the stream layer.
- Service: `application/world/WorldSoundscapeService.js` samples at the local avatar (or the camera) four times a
  second, only after a 0.5 m move, and owns mute and volume through `application/settings/SoundSettingsStore.js`
  (`core/SoundSettings.js`, read leniently). Sound is on by default at half volume; browsers keep it silent until
  the first click, tap or key press, which calls `unlock()`.
- Provider: `audio/WebAudioSoundscapeProvider.js`, a new adapter directory. Noise loops and oscillators per layer,
  randomly timed bird calls, fades on every level change; the `AudioContext` is made on the first gesture and
  suspended while muted or hidden.
- UI: `ui/components/SoundControl.js` over the viewport (top right; bottom right on a narrow screen, above the touch
  pad on a touch screen, where the slider gives way to the device's volume buttons), `M` in
  `ui/views/worldView/useViewportInput.js`, wiring in `ui/views/worldView/useWorldSoundscape.js` and `ui/main.js`.
- Docs: `docs/user/03-WorldView.md` (Sound), `docs/user/ControlsReference.md`, `docs/Architecture.md` (Ambient
  sound), `docs/Privacy.md` (the stored preference).
- Tests: `tests/AmbientSoundscape.test.js` (levels in range, pure, silent without a position, forest/highland/field/
  lake/river each sound like themselves), `tests/SoundSettings.test.js`, `tests/WorldSoundscapeService.test.js`
  (preference applied, the mix follows the listener, no resume before a gesture, mute/volume remembered, dispose),
  and the browser test `tests/WebAudioSoundscapeProvider.test.js` (renders each layer with an `OfflineAudioContext`
  and checks it is audible, silence, volume and mute, fade-in, suspension while muted or hidden, no Web Audio, and
  World View's `M` key and gesture unlock).
- Not done: no sound in the Editor; no positional sound; recorded sounds could replace the synthesized ones later
  without changing the service.

## Footsteps, jumps, landings and vehicle engines (unnumbered, 2026-09-29)

**Your avatar is now heard as well as the land: footsteps that keep time with its walk or run and change with what
is underfoot (grass, forest leaves, beach sand, stone, water, bricks), a whoosh as it jumps and a thud as it lands,
and, while riding, the vehicle itself — a bicycle's tyres, a motorcycle's buzz, a car's rumble, a drone's whine —
rising with speed.**

Phase 2 of World View's sound, on the same synthesized Web Audio provider as the ambience, so still no audio files,
no server and no policy change. Everything is derived from what the avatar already does; nothing new is stored or
sent, and other people don't hear your footsteps.

- Cues: `core/AvatarSoundCues.js`. `advanceAvatarSound()` is a pure per-frame step over
  `{ position, animation, verticalState, vehicleType }`. Footsteps are counted by distance at one per leg swing of
  the existing gait (0.75 m walking, 0.94 m running), so being blocked is silent and teleports make none;
  `footstepSurfaceAt()` reads the ecology zone, rivers, and whether the avatar stands on bricks. A jump is leaving the
  ground; a landing needs 0.15 s in the air, so stair steps don't thud. An engine's load is speed over the ridden
  vehicle's top speed.
- Session: `WorldNavigationSession#avatarSoundObservation()` and `#onRenderFrame(callback)`.
- Service: `WorldSoundscapeService` subscribes to render frames when given an avatar observation, plays cues through
  `provider.playCue()`, and resends `provider.setEngine()` only on a type change or a load change of 0.02; it
  unsubscribes on dispose.
- Audio: `audio/AvatarSoundSynth.js` (footstep per surface, jump, landing) and `audio/VehicleEngineVoice.js` (a held
  voice per vehicle type) on an effects bus in `audio/WebAudioSoundscapeProvider.js`. Cues are dropped while the
  context isn't running, so unmuting never plays a backlog.
- Docs: `docs/user/03-WorldView.md` (Sound), `docs/Architecture.md` (the "Ambient sound" section is now "Sound").
- Tests: `tests/AvatarSoundCues.test.js` (surfaces per zone, river and bricks; step cadence walking and running; no
  steps idle, blocked or teleported; jump, landing, and no thud for a brief drop; engine load per vehicle; no avatar),
  `tests/WorldSoundscapeService.test.js` (frame cues, engine throttling, unsubscribing), the end-to-end
  `tests/AvatarSoundObservation.test.js` (a real session walked, jumped, ridden and dismounted), and the browser test
  `tests/WebAudioSoundscapeProvider.test.js` (each surface audible and short, softer steps quieter, jump and landing,
  no queued cues while suspended or muted, each engine louder and higher at speed, a silent parked bicycle, engines
  fading out and starting once audio does).
- Not done: other avatars' footsteps and positional sound; animals, residents and the Editor.

## Animal, resident and Editor sounds (unnumbered, 2026-09-29)

**The living things around you are heard now, and so is building. A deer snorts and a rabbit thumps when it looks up
alert or when you come close, their steps are heard as they wander, and catching or releasing one makes a rustle and
a rising or falling pluck. A resident hums a hello as it greets you, murmurs in its own voice as it talks, and is
heard walking by. Each is placed left or right of the camera and fades with distance. In the Editor every edit has a
short sound of its own, with undo, redo and save sounds, and the same Sound button, `M` and mute setting as World
View.**

Phase 3 of sound, on the same synthesized provider. As before nothing is downloaded, stored (beyond the existing
preference) or sent.

- Creatures: `core/CreatureSoundCues.js#advanceCreatureSound()`, a pure step over
  `WorldNavigationSession#creatureSoundObservation()` (new `application/worldNavigation/soundObservationMethods.js`:
  `soundListener()`, `animalsForSound()`, `carriedAnimalsForSound()`, `residentsForSound()`). Calls come from the
  deterministic idle schedule (`idleAction` turning ALERT) and from approach within an animal's look radius; steps from
  its `gaitPhase`; catch and release from the carried animals changing; a resident's greeting from standing within
  3.5 m, speech from a new `lastResidentSpeech()`, steps every 0.7 m. Nothing already true when sound starts is played.
  `placeSound()` gives each cue its distance fade and pan. `WorldSoundscapeService` samples them every 0.1 s of render
  frames and plays them with `provider.playCreatureCue()` (`audio/CreatureSoundSynth.js`).
- Editor: `EditorSession#onCommandActivity()` reports the user's own executed, undone and redone commands (a
  collaborator's arrive through `_remoteApplyingHistory()` and are left out); `core/EditorSoundCues.js` maps every
  registered command type to one of eleven cues; `application/editor/EditorSoundService.js` plays them, and Save, on
  `WebAudioSoundscapeProvider({ ambience: false })` with `audio/EditorSoundSynth.js`. The Toolbar emits `saved`.
- Shared: `application/settings/SoundPreference.js` (mute and volume, used by both services) and
  `ui/composables/useSoundControls.js` (the Sound button, `M` and gesture unlock, used by both views;
  `useWorldSoundscape()` is now a thin wrapper). `ui/main.js` provides `createEditorSound`.
- Docs: `docs/user/03-WorldView.md` and `docs/user/02-TheEditor.md` (Sound), `docs/user/ControlsReference.md`
  (`M` in both views), `docs/Architecture.md` (Sound).
- Tests: `tests/CreatureSoundCues.test.js` (distance fade and pan, alert calls once, startle and rearm, steps, catch and
  release, greetings, speech once and longer for more words, resident steps and voices), the end-to-end
  `tests/CreatureSoundObservation.test.js` (a real session: listener, a real wild animal caught and released, a real
  resident talked to, 10 Hz sampling), `tests/EditorSound.test.js` (every registered command has a sound, composites,
  undo/redo, a real two-replica collaboration where the remote edit is silent, the service and shared preference), and
  the browser test (every creature and Editor sound audible, panning, distance, no ambience in the Editor).
- Not done: other avatars' footsteps and vehicles, and true 3D (HRTF) sound; `M` isn't listed in the Editor's
  Keyboard Shortcuts overlay, which lists the action registry.

## Vehicle get-on, get-off and brake sounds, tree sounds, World View edit sounds (unnumbered, 2026-09-29)

**Three gaps left after the sound phases, from the original audit: getting on and off a vehicle and braking are
heard now (a bicycle's bell and kickstand, a motorcycle's kick-start, a car door and ignition, a drone spinning up and
down; brake pads or tyres squealing, louder the faster you were going); the trees around you are heard by kind
(leaves rustling in broadleaf woods and scrub, wind sighing in conifers); and changes made to a World in World View
(landmarks, regions, residents, decorations, undo and redo) make the same sounds as in the Editor.**

- Vehicles: `core/AvatarSoundCues.js` adds MOUNT, DISMOUNT and BRAKE cues from the ridden vehicle type changing and
  from `braking` (`avatarSoundObservation()` now reports `movementState().brakingRequested`) turning on at 15% of top
  speed or more; `audio/VehicleEventSynth.js` plays them.
- Trees: `core/AmbientSoundscape.js` adds LEAVES and PINES layers from `naturalFeaturesInRegion()` within 20 m,
  weighted by nearness; the provider plays them as a gusting high rustle and a slow airy band.
- World View edits: `WorldNavigationSession#onCommandActivity()` over each World's CommandHistory (a collaborator's
  operations never pass through it), played by `WorldSoundscapeService` with the Editor's cues.
  `application/commands/describeCommand.js` is now shared by both sessions.
- Docs: `docs/user/03-WorldView.md` (Sound), `docs/Architecture.md` (Sound).
- Tests: `tests/AmbientSoundscape.test.js` (broadleaf, conifer and treeless ground; a lone tree louder up close),
  `tests/AvatarSoundCues.test.js` (mount, dismount, changing vehicle, already riding, braking at speed once, not at a
  standstill or on foot), `tests/AvatarSoundObservation.test.js` (a real session mounting, dismounting and braking),
  `tests/WorldSoundscapeService.test.js` and `tests/CreatureSoundObservation.test.js` (World View edits, and adding,
  undoing and redoing a real resident heard), and the browser test (both tree layers, every vehicle's get-on,
  get-off and brake).

## `M` in the Editor's Keyboard Shortcuts overlay (unnumbered, 2026-09-29)

The Editor's Keyboard Shortcuts overlay (`?`) now lists **Sound on/off — `M`** with the other view-level shortcuts
(Save, tool switching), closing the last gap noted when Editor sounds landed. `M` stays a view shortcut
(`ui/views/EditorView.js`, step 3.8) rather than a registry action, because it isn't an editing operation.

- `ui/components/KeyboardShortcutsOverlay.js`: a `VIEW_LOCAL_SHORTCUTS` row.
- Docs: `docs/user/02-TheEditor.md` (Sound).
- Tests: `tests/KeyboardShortcutsOverlayBrowser.test.js` mounts the real overlay and checks the row is listed once,
  and that no Editor action claims plain `M`.

## Other players' footsteps, and 3D sound (unnumbered, 2026-09-29)

**Other people's avatars are heard now: footsteps on whatever they walk on, jumps and landings, from where they are,
as long as you can see them. And the sounds around you are placed in 3D (in front or behind, above or below, as well
as left and right) turning as the camera turns, with a 3D/Stereo button beside the volume slider.**

Both use what World View already has: presence already carries each player's position and animation, and Web Audio's
PannerNode (HRTF) and AudioListener do the placement. Nothing new is sent; the 3D choice is kept with the sound
preference. Other players' vehicles need a presence change and stay a separate milestone.

- Players: `soundObservationMethods.js#remoteAvatarsForSound()` (over the new `RemoteAvatarRegistry#currentPresence()`)
  feeds `core/CreatureSoundCues.js`, which runs each player through `advanceAvatarSound()`; PLAYER_FOOTSTEP, JUMP and
  LAND cues, played through the same footstep synthesis. Hidden avatars aren't heard.
- 3D: cues carry `position`; `soundListenerPose()` sets the AudioListener every frame through the new
  `listenerPose` option of `WorldSoundscapeService`; the provider's `setSpatial()`/`setListener()` and a PannerNode per
  placed cue with its rolloff off. `core/SoundSettings.js` gains `spatial` (a choice saved before reads as on),
  `SoundPreference#setSpatial()`/`toggleSpatial()`, and `SoundControl`'s 3D/Stereo button in World View.
- Docs: `docs/user/03-WorldView.md` (Sound), `docs/Architecture.md` (Sound), `docs/Privacy.md` (the stored choice).
- Tests: `tests/CreatureSoundCues.test.js` (positions on placed cues; another player's steps, jump and landing, placed
  where drawn, softer, not beyond 20 m), `tests/CreatureSoundObservation.test.js` (the real listener pose; a real
  `RemoteAvatarRegistry` player heard walking and silent when hidden), `tests/SoundSettings.test.js` and
  `tests/WorldSoundscapeService.test.js` (the 3D choice, the listener every frame), and the browser test (rendered
  HRTF: right and left ears, straight ahead, a turned listener, distance left to the cue's gain, the stereo fallback,
  and the 3D button).
- Not done: vehicles other people ride; a player's landing weight (their vertical speed isn't sent).

## Other players' vehicles, seen and heard (unnumbered, 2026-09-29)

**Someone riding a bicycle, motorcycle, car or drone is now seen riding it: the vehicle is drawn under them, facing
the way they go, and heard: its engine following their speed from where they are, their getting on and off, and a
squeal when they stop sharply. Your own copy of a vehicle someone else rides disappears and can't be mounted
meanwhile.**

What an avatar rides travels as its own signed message on `forkbuild:avatar-vehicle`, not as a presence field, so
older clients keep accepting presence and simply don't see riders. Where a vehicle stands unridden stays each
replica's own, as before: after a dismount the vehicle reappears for others wherever their replica last had it.

- Message: `core/AvatarVehicleAdvertisement.js` (`{ avatarId, ownerIdentity, riding, vehicleId, vehicleType,
  sequence }`, signing type `avatar-vehicle`), `LocalAuthorizationVerifier#verifyAvatarVehicleAdvertisement()`,
  `AvatarVehicleTrustBoundary`, `AvatarVehicleSigning`, `AvatarVehicleSyncService`; wired in `CreateWorldViewUseCase`
  like the profile and interaction channels, gated by the presence visibility policy.
- Session: `application/worldNavigation/remoteVehicleMethods.js` sends on getting on or off and every 2 s, takes in
  others' each frame, hides ridden vehicles from `syncVehicles()`, from mounting (`isTakenByOther` on
  `AvatarVehicleInteractionController`) and from what residents mention (`riddenVehicleIds` in
  `ResidentSurroundings`).
- Drawing: `renderer/RemoteRiderVehicles.js` and `setRemoteAvatarVehicle()` on the render facade; a remote rider is no
  longer lifted by the ground height twice.
- Sound: `core/CreatureSoundCues.js` runs each player through its vehicle, adds PLAYER_MOUNT/DISMOUNT/BRAKE (braking
  estimated from a sharp slowdown) and returns the nearest three riders' engines within 40 m;
  `WebAudioSoundscapeProvider#setRemoteEngines()` keeps a placed engine voice per rider.
- Docs: `docs/Protocol.md`, `docs/Privacy.md`, `docs/Architecture.md` (Riding, Sound), the principle "Others See What
  You Ride, Never Where You Parked", `docs/user/06-AvatarsAndPresence.md` and `docs/user/03-WorldView.md`.
- Tests: `tests/RemoteRiderVehicles.test.js` (message shape and signing; the trust boundary; two real sessions over
  in-memory channels: getting on is told once and drawn for the other, their copy hidden and not mountable, the
  heartbeat, getting off, heard riding at the drawn height), `tests/RemoteRiderVehiclesRenderer.test.js`,
  `tests/ResidentTalk.test.js` (a vehicle someone else rides isn't mentioned),
  `tests/CreatureSoundCues.test.js` (engines follow speed, getting on and off, one brake for a sharp stop and none
  for easing off, the nearest three within 40 m) and the browser test (placed engine voices per vehicle, 3D and
  stereo, fading out, rider cues). Checked in the real app with two identities in two browsers.
- Not done: sharing where a vehicle was left; a stored or newly deployed vehicle is seen by others only while ridden.

## Internationalization, phase 1: the foundation (unnumbered, 2026-09-29)

ForkBuild showed English only, with every piece of text written straight into its components. This lays the
foundation for translating it without changing how anything else works: a translator, a way to choose the language,
and a pseudo-locale for finding text that isn't ready yet. It is the first of the phases planned for i18n: next,
text built in `core/` and `application/` (action labels, library names, errors) becomes keys, then the UI is moved
over area by area, then resident speech and the hand-made plurals, then a first real translation.

- Translator: `ui/i18n/Translator.js` (lookup with an English fallback and a one-time report of each gap,
  `Intl.PluralRules` plural forms with `=N` exact matches, `{name}` parameters, `Intl` number and date formatting);
  `ui/i18n/i18n.js` holds the app's one instance and exports `t()`, `formatNumber()`, `formatDate()`,
  `setAppLocale()` and `applyDocumentLanguage()`. No library: the browser's `Intl` does the locale work, and the
  import map and its CSP hash are unchanged.
- Locales: `ui/i18n/locales.js` lists English and the pseudo-locale `en-XA` (`ui/i18n/pseudoLocalize.js`: accented,
  30% longer, bracketed, placeholders kept) and chooses one from the saved setting, then the browser's languages
  (exact, then by language), then English. The pseudo-locale is never chosen automatically.
- Setting: `core/LanguageSettings.js` and `application/settings/LanguageSettingsStore.js` (`language-settings`,
  read leniently). `ui/boot.js` sets the locale and the page's `lang`/`dir` after opening storage and before
  importing the app. Changing the language saves it and reloads, rather than switching live and leaving text
  computed earlier in the old language.
- UI: a **Language** page (`ui/views/LanguageSettingsView.js`, `/settings/language`) in the top nav, listing each
  language by its own name, with the pseudo-locale under **For translators**. `ui/App.js`'s header and nav and
  `ui/components/SoundControl.js` now go through `t()` as the first examples.
- Docs: `docs/Translating.md` (messages, plurals, adding a language, making text translatable),
  `docs/CodingConventions.md`, `docs/Architecture.md` (UI), `docs/Privacy.md`, `docs/user/01-GettingStarted.md`,
  `CONTRIBUTING.md`.
- Tests: `tests/I18n.test.js` (parameters, number and date formatting per locale, plural categories in English,
  Polish and Indonesian, fallback and gap reporting, the pseudo-locale, every shipped locale matching English's keys,
  placeholders and plural shapes, locale choice, the stored setting, the Language page saving and reloading, the
  app-wide translator and page language) and `tests/I18nSoundControlBrowser.test.js` (the real SoundControl in
  English and in the pseudo-locale). `tests/PublisherPerformanceLeaderboardUi.test.js` now counts fourteen top-nav
  links.
- Not done: the rest of the UI's text, keys from `core/` and `application/`, any real translation, right-to-left
  styles (the stylesheet still uses physical `left`/`right`), and translated user docs.

## Internationalization, phase 2: text from `core/` and `application/` as messages (unnumbered, 2026-09-29)

Phase 1 gave the UI a translator, but much of what a person reads was written in English below the UI, where `t()`
can't be called: the Editor's action labels and feedback, the license and presence labels, the passphrase rules,
the messages for opening a Publication link, the fork-on-edit notice and refusal, the World welcome suggestions and
the Build Library's names. Those layers now name their text with a message key instead, and the UI shows it in the
chosen language. English reads exactly as before.

- Mechanism: `core/Message.js` (`message(key, params)`, a frozen descriptor whose `toString()` is its key, so one
  that slips past `t()` is visible rather than `[object Object]`) and `core/UserFacingError.js` (an Error carrying a
  descriptor; its `.message` is the key plus a developer detail). `ui/i18n/i18n.js` adds `t(descriptor)`,
  `displayText()`, `errorText()` and `hasMessage()`; `Translator` translates descriptor parameters and joins lists
  with `Intl.ListFormat`.
- Editor actions (`application/editor/EditorActionRegistry.js`): every label and description is named after the
  action's id (`editorAction.<id>`, `.description`, `.done`, `.nothing`), categories are ids
  (`editorActionCategory.<id>`), and reasons and "not available" feedback are messages. `findMatching(query, toText)`
  searches what the person reads. A session refusing an action with a UserFacingError now reaches the person as its
  message, where the fork-on-edit refusal used to show "WorldNavigationSession: forking is not permitted…". The
  command palette, Keyboard Shortcuts overlay (including its own tables), sidebar, selection inspector and both views'
  feedback show them.
- Label modules: `LicenseLabels.js`, `PlacementPolicyLabels.js`, `DocumentLifecycleStatus.js`,
  `AvatarPresenceLabels.js` and `NewPassphrasePolicy.js` return descriptors; `forkOnWriteMethods.js`'s notice and
  refusal too.
- Links: `OpenPublicationLink.js` says each outcome as one whole sentence per network, with the network's own error
  as an untranslated `{detail}`; `core/ForkBuildAppLinks.js` labels and `PublicationClaimRetriever.js`'s missing-reader
  error are messages; `ui/views/PublicationLinkView.js` is fully translated.
- `core/WorldWelcomeContext.js`: suggestion reasons and activity summaries are messages, one whole sentence per
  activity with and without a target.
- Build Library: `ui/i18n/libraryText.js` looks up a built-in brick's or structure's name and description by id
  (`library.core.slope45`), falling back to the item's own name, so personal blueprints and community libraries are
  never translated; search matches both the shown and the English name.
- Docs: `docs/Translating.md` (text from `core/` and `application/`), `docs/CodingConventions.md`,
  `docs/Architecture.md` (UI).
- Tests: `tests/I18nMessageKeys.test.js` (descriptors, UserFacingError, `t`/`displayText`/`errorText`, nested and
  list parameters, every editor action run through a capable, an empty and a bare session with every label, reason
  and report checked for an English message, a refusal reaching the person as its message, every label module value,
  every link outcome on every network, every built-in library item, and the pseudo-locale); 18 existing tests now read
  labels and feedback through `t()`, and `WandererPresenceSessionContinuityProductReassessment` checks the presence
  labels by behavior instead of source text. Checked in the real app: the Editor's library, palette and shortcuts in
  English and the pseudo-locale, with no untranslated keys.
- Not done: command history descriptions ("Place Brick", "Undo …"), which documents store, so they need their own
  change; the Publications page's result views (`PublicationEvidenceDiscoveryView.js` and the other four), which move
  with that page; other thrown errors, area by area; resident speech.

## Internationalization, phase 3: the Editor (unnumbered, 2026-09-29)

The first area of the UI moved to `t()`, so the whole Editor can be shown in another language: in the pseudo-locale
nothing is left in plain English but the ForkBuild name, blueprint fingerprints and a new document's default title.
Phase 3 goes area by area, one pull request each; World View, the Publications page, and Identity, Peers, Chat and
the settings pages follow.

- Components: `Toolbar`, `EditingSidebar`, `SelectionInspector`, `NumericTransformPanel`, `AlignmentPanel`,
  `RepeatPanel`, `StructureInstancePanel`, `BuildLibraryPanel`, `StructureLibraryCard`, `StructureInfoPanel`,
  `DocumentInfoPanel`, `MetadataEditorDialog`, `CreateBlueprintDialog`, `ForkFailureDialog`, `RecoveryBanner`,
  `TransformFeedback`, `EditorTouchActionBar`, `EditorDistributionDialog`, `PublicationShareLink` and
  `saveFailureMessages`; `ui/views/EditorView.js` and its composables in `ui/views/editorView/`. Summaries built
  from pieces ("Imported 3 documents, 1 already here") are now separate messages joined with the language's list
  format; counts use plural forms; dates and numbers use the chosen locale.
- Build Library categories: `libraryCategoryName()` in `ui/i18n/libraryText.js` translates built-in structure
  categories and brick sections, and leaves a category a person typed as they typed it; the category filter is sorted
  by the names shown.
- Below the UI: `core/BlueprintSimilarity.js#describeBlueprintSimilarity()`, `core/sortStructures.js`'s sort labels,
  `application/steem/SteemContentUploadProgressText.js` (one whole message per combination of resuming and Resource
  Credits) and `application/publication/PublicationShareLink.js` return messages. The refusals in
  `BlueprintAttributionUseCase` and `BlueprintLineageUseCase` (sign in first, nothing to claim, a claim that won't
  verify) are UserFacingErrors, so the Editor shows them in the person's language instead of the use case's own
  text with its class name stripped.
- Docs: `docs/Translating.md` lists which areas are ready.
- Tests: updated to read converted text through `t()`, including older source-text checks in
  `WorldEditingUnsavedStateProductReassessment`, `SortOptionsByLabel`, `EditorTransformGestureFeedback` (which now
  allows its one translator import) and the harnesses of `ForkFailureUXConvergenceAudit` and
  `UnifiedDistributionActionUX`, which run extracted source and now receive `t`. Checked in the real app by scanning
  every text, title, label and placeholder of the Editor, its Structures tab, a structure's details, the document
  properties dialog, a selected brick and the Recent list in the pseudo-locale.
- Not done: the default title of a new document and the undo/redo and history labels, which are stored in documents;
  numbers typed into the numeric panel still need a `.` as the decimal point.

## Internationalization, phase 3: World View (unnumbered, 2026-09-29)

The second area moved to `t()`: World View's panels, dialogs, prompts, Explore sidebar, map, compass and feedback can
now be shown in another language. The Publications page and Identity, Peers, Chat and the settings pages follow.

- Components: the 88 files World View renders — `ui/views/WorldView.js`, its composables and templates in
  `ui/views/worldView/`, `WorldEncounterCanvas` and `OwnPublicationPanel` with their subdirectories, and the panels
  they open (locations, landmarks, regions, place naming, geographic places, search, map, members, collaborators,
  focus, welcome, lobby, placement, avatar, vehicle, animal and resident prompts, touch pad). Messages are named
  after the component (`worldSearchPanel.find`). Fallback failures ("… could not be completed.") are `failure.*`
  messages, and an error's own text is shown with `errorText()`. Counts use plural forms; dates, distances and
  radii use the chosen locale.
- Values core/ keeps as ids: `ui/i18n/worldText.js` translates compass directions (the dial, the legend and every
  "12m NE"), region kinds, terrain zones and lakes/rivers in the location reading, and what a collaborator is doing
  ("Building House"). `RegionFormModal`'s kind list uses the same messages.
- Below the UI: `core/WorldFocusContext.js` returns messages for the focus panel's subtitle, a collaborator's
  activity, a geographic place's summary and "You are in / near …". `core/WorldSpatialContext.js#description` and
  `describeSpatialActivity()` keep their English for the 3D markers, which the renderer draws and are not yet
  translated.
- Fixes found on the way: coordinates are shown without digit grouping ("1095.0", not "1,095.0"), and the
  distribution dialog's network names (Arweave, Nostr, Steem) stay names rather than messages.
- Tests: `tests/support/EnglishSource.js#withEnglish()` puts the English back where a source has `t('key')`, so the
  older tests that check World View's wording by reading its source still check the words a person sees; about
  fifteen of them read through it now. `WorldViewFocus` reads the focus text through `displayText()`; the "imports
  nothing" checks on `HistoryTimelinePanel`, `PlacementInfoPanel` and `WandererMarker` allow the translator; the
  list of unreachable networks is joined by `Intl.ListFormat` ("Nostr, Arweave, or Steem"). Checked in the real
  app by opening a saved document in World View in the pseudo-locale, clicking through its sidebar, modes and
  panels, and scanning every text, title, label and placeholder: no plain English and no warnings.
- Not done: resident speech, the 3D markers' labels, and numbers typed into the placement and search fields, which
  still need a `.` as the decimal point.

## Internationalization, phase 3: the Publications page (unnumbered, 2026-09-29)

The third area moved to `t()`: the Publications page with its Wallet, Archive & Publisher Tools, the Repository and
its cards and list, Recent Worlds, an author's page, Home, and the experimental leaderboard and reconciliation
pages can now be shown in another language. Identity, Peers, Chat, Following and the settings pages follow.

- Components: `ui/views/DecentralizedPublicationsView.js`, its composables and templates in
  `ui/views/decentralizedPublications/`, `RepositoryView`, `PublicationCatalog`, `PublicationCatalogToolbar`,
  `PublicationCard`, `PublicationList`, `PublicationCommentarySection`, `SharePublicationButton`,
  `SharedWithYouPanel`, `ForkTree`, `WorldCard`, `RecentWorldsView`, `AuthorView`, `HomeView`, the leaderboard and
  reconciliation views, and `ui/components/reconciliation/`. Counts use plural forms; dates follow the chosen
  language (`ui/i18n/dateText.js`: a publication's date, and "today / yesterday / 3 days ago" from
  `Intl.RelativeTimeFormat`, which also fixes World View's welcome panel); a card's license reads as its name.
- A sentence with a link or button inside it is one message: `ui/i18n/I18nText.js` places each element, passed as a
  slot, where the message's `{placeholder}` sits, so a translation can move it.
- Below the UI: the application views the page reads its states from return messages (core/Message.js), among them
  what a publication check found, how a retrieval went, each content kind's summary and republish advice, and the
  anchoring, evidence, snapshot, placement and IPFS views under `application/anchoring/`, `application/ipfs/`,
  `application/publication/` and `application/snapshot/`. A sentence with an optional part ("… between observation
  2 and observation 3") has one message per form.
- Fixes found on the way: `worldEncounterCanvas.source` was defined twice in the English messages, so World View's
  "Source" label read "Source: {source}"; `tests/I18n.test.js` now fails on a key written twice. Network and product
  names (Arweave, Nostr, Steem, IPFS, Bitcoin, Base) are shown as they are rather than as messages.
- Tests: `withEnglish()` also puts English back for `message('key')`, and the older tests that read this area's
  wording from its source read through it; tests of the application views compare `displayText()` of what they
  return. Checked in the real app in the pseudo-locale on every page named above, opening each folded panel and
  clicking through its non-destructive buttons, with an identity signed in: no plain English but names and data,
  and no warnings. The publication cards themselves are covered by `PublicationsPageLayoutBrowser`, which renders
  them with real Vue.
- Not done: the technical reason a publication failed its check (the checker's own detail) stays English, as does
  a new document's default title.
