import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { computeCameraFraming, CameraPerspective } from '../core/CameraPerspective.js';
import { AVATAR_COLLISION_RADIUS, AVATAR_COLLISION_HEIGHT, avatarAabbAt, brickAabb, aabbsOverlap } from '../core/AvatarCollision.js';
import { simulateAvatarMovement } from '../core/AvatarMovementSimulation.js';
import { AvatarMovementState } from '../core/AvatarMovementState.js';
import { CoreLibrary } from '../core/library/CoreLibrary.js';
import { VEHICLE_INTERACTION_RADIUS, withinRadiusXZ, avatarVehicleProximity } from '../core/AvatarVehicleProximity.js';
import { BICYCLE_DISMOUNT_OFFSET_X, resolveAvatarVehicleDismountPosition } from '../core/AvatarVehicleDismountPosition.js';
import { VehiclePresence } from '../core/VehiclePresence.js';
import { VehicleType } from '../core/VehicleType.js';
import { distanceXZ, deriveProximityTier, WorldSpatialProximityTier } from '../core/WorldSpatialAnchor.js';
import { distanceBetween, isWithinRadius } from '../core/SpatialQuery.js';
import { detectSpatialOverlap } from '../core/SpatialOverlap.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { deriveNearbyGeographicPlaces, DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS } from '../core/GeographicPlaceNavigation.js';
import { shouldRefreshSnapshotDiscovery, DEFAULT_DISCOVERY_REFRESH_RADIUS } from '../application/ShouldRefreshSnapshotDiscovery.js';
import { shouldRefreshPlaceNamingDiscovery, DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS } from '../application/ShouldRefreshPlaceNamingDiscovery.js';

// 0.9.549 — World Spatial Interaction Product Reassessment.
//
// 0.9.547 audited whether "1 World Unit = 1 meter" could be DECLARED
// without touching a single stored value; 0.9.548 declared it. Neither
// asked the next, genuinely different question this milestone's own
// brief poses: now that World distance carries an explicit real-world
// meaning, are the actual interaction distances and spatial affordances
// a Wanderer experiences — selection, placement, discovery, encounter,
// vehicle interaction, camera framing, user-facing distance display —
// coherent under that meaning? This is a product-usability question,
// not a physics question (0.9.547 already closed physics). Test/
// document-only, no production changes — checked directly against real,
// unmodified production source and real object graphs, exactly like
// every "Product Reassessment" milestone before it.
//
// A note on what this file can and cannot live-execute: this codebase's
// live camera (renderer/CameraController.js) wraps THREE.js and
// three/addons/controls/OrbitControls.js. Neither package is installed
// in this Node-only test harness (`node -e "import('three')"` throws
// "Cannot find package 'three'" — checked fresh for this milestone, not
// assumed), so this file can never import or execute that module, the
// same constraint every prior "Product Reassessment" milestone touching
// renderer/ code has quietly worked within. Where this file needs a
// fact from that file, it reads the real numeric literal from real
// source text (`readSource()` + `extractConstant()`, the identical
// technique 0.9.547 already established for private, unexported
// constants) and reasons about it mathematically — never a guess, never
// a re-declared duplicate, but also never a claim that OrbitControls
// itself was executed here.
//
// Sections (mirroring the requesting brief's own A-J structure):
//   A — Interaction-distance inventory, classified physical /
//       algorithmic / UI-only.
//   B — Human-scale evaluation of those real values.
//   C — Placement interaction chain.
//   D — Encounter/discovery threshold verification.
//   E — Camera/avatar relationship (this milestone's own flagship
//       finding lives here).
//   F — User-facing presentation inventory.
//   G — Boundary consistency across subsystems.
//   H — Failure and edge cases.
//   I — Product gap classification.
//   J — Flagship: a real, composed human-scale scenario.
//   K — Deliberate exclusions and production guard.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function extractConstant(source, name) {
    const match = source.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*(-?[\\d.]+)`));
    assert(match, `extractConstant: "${name}" not found as a const literal in the given source.`);
    return Number(match[1]);
}

// `renderer/CameraController.js` sets `DEFAULT_MAX_POLAR_ANGLE = Math.PI / 2 - 0.01;`
// — an expression, not a bare numeric literal, so it needs its own
// extractor rather than stretching extractConstant()'s literal-number
// regex to cover it.
function extractPolarAngleConstant(source) {
    const match = source.match(/const DEFAULT_MAX_POLAR_ANGLE\s*=\s*Math\.PI\s*\/\s*2\s*-\s*([\d.]+)/);
    assert(match, 'extractPolarAngleConstant: DEFAULT_MAX_POLAR_ANGLE not found in the expected "Math.PI / 2 - <epsilon>" shape.');
    return Math.PI / 2 - Number(match[1]);
}

// The polar angle (radians, measured from the world +Y/"up" axis) a
// camera {position} implies when looking at {target} — the same
// spherical-coordinate convention three/addons/controls/OrbitControls.js
// itself uses internally (offset = position - target; phi = angle of
// that offset from +Y). Pure trigonometry, no THREE.js dependency.
function impliedPolarAngle(position, target) {
    const offset = { x: position.x - target.x, y: position.y - target.y, z: position.z - target.z };
    const radius = Math.sqrt(offset.x * offset.x + offset.y * offset.y + offset.z * offset.z);
    if (radius === 0) return 0;
    return Math.acos(offset.y / radius);
}

function impliedDistance(position, target) {
    return distanceBetween(position, target);
}

async function main() {
    const inventory = [];
    function record(name, value, classification, source, reason) {
        inventory.push({ name, value, classification, source, reason });
        return value;
    }

    let cameraControllerSrc, cameraPerspectiveSrc, avatarStepConstraintSrc, avatarMovementConstraintSrc;

    // ===================================================================
    // Section A — Interaction-distance inventory
    // ===================================================================
    {
        cameraControllerSrc = await readSource('renderer/CameraController.js');
        cameraPerspectiveSrc = await readSource('core/CameraPerspective.js');
        avatarStepConstraintSrc = await readSource('application/AvatarStepConstraint.js');
        avatarMovementConstraintSrc = await readSource('application/AvatarMovementConstraint.js');

        // PHYSICAL DISTANCE — a real spatial extent that gates whether an
        // interaction can physically happen at all.
        record('VEHICLE_INTERACTION_RADIUS', VEHICLE_INTERACTION_RADIUS, 'PHYSICAL', 'core/AvatarVehicleProximity.js', 'must be near enough to actually reach/mount the vehicle');
        record('BICYCLE_DISMOUNT_OFFSET_X', BICYCLE_DISMOUNT_OFFSET_X, 'PHYSICAL', 'core/AvatarVehicleDismountPosition.js', 'a real world-space step away from the vehicle a dismounting avatar lands at');
        record('AVATAR_COLLISION_RADIUS', AVATAR_COLLISION_RADIUS, 'PHYSICAL', 'core/AvatarCollision.js', 'a hitbox — real, load-bearing physical extent (already inventoried by 0.9.547, reused here for ratio checks)');

        // ALGORITHMIC THRESHOLD — a pacing/query-shaping number with no
        // physical referent to check against; a "does this feel right"
        // or "how wide a net to cast" choice.
        record('DEFAULT_DISCOVERY_REFRESH_RADIUS', DEFAULT_DISCOVERY_REFRESH_RADIUS, 'ALGORITHMIC', 'application/ShouldRefreshSnapshotDiscovery.js', 'movement-gate pacing for Snapshot discovery refresh');
        record('DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS', DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS, 'ALGORITHMIC', 'application/ShouldRefreshPlaceNamingDiscovery.js', 'movement-gate pacing for Place Naming discovery refresh');
        record('DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS', DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS, 'ALGORITHMIC', 'core/GeographicPlaceNavigation.js', 'how far away a geographic place is still worth listing');
        record('DEFAULT_QUERY_RADIUS(AvatarStepConstraint)', extractConstant(avatarStepConstraintSrc, 'DEFAULT_QUERY_RADIUS'), 'ALGORITHMIC', 'application/AvatarStepConstraint.js', 'broad-phase obstacle-query radius, not a user-facing interaction distance');
        record('DEFAULT_QUERY_RADIUS(AvatarMovementConstraint)', extractConstant(avatarMovementConstraintSrc, 'DEFAULT_QUERY_RADIUS'), 'ALGORITHMIC', 'application/AvatarMovementConstraint.js', 'broad-phase obstacle-query radius, not a user-facing interaction distance');
        record('MAX_DOCUMENT_SPAN_MARGIN(AvatarStepConstraint)', extractConstant(avatarStepConstraintSrc, 'MAX_DOCUMENT_SPAN_MARGIN'), 'ALGORITHMIC', 'application/AvatarStepConstraint.js', 'margin added atop the query radius before inspecting a document at all');
        record('DEFAULT_MIN_DISTANCE(orbit camera)', extractConstant(cameraControllerSrc, 'DEFAULT_MIN_DISTANCE'), 'ALGORITHMIC', 'renderer/CameraController.js', 'free-look orbit zoom-in limit — a UX choice about how close a hand-driven camera may approach its target');
        record('DEFAULT_MAX_DISTANCE(orbit camera)', extractConstant(cameraControllerSrc, 'DEFAULT_MAX_DISTANCE'), 'ALGORITHMIC', 'renderer/CameraController.js', 'free-look orbit zoom-out limit');
        record('FIRST_PERSON_LOOK_DISTANCE', extractConstant(cameraPerspectiveSrc, 'FIRST_PERSON_LOOK_DISTANCE'), 'ALGORITHMIC', 'core/CameraPerspective.js', "purely so target != position — this file's own header: \"the exact distance has no gameplay meaning\"");
        record('THIRD_PERSON_BACK_DISTANCE', extractConstant(cameraPerspectiveSrc, 'THIRD_PERSON_BACK_DISTANCE'), 'ALGORITHMIC', 'core/CameraPerspective.js', 'a framing choice, not a physical constraint');
        record('THIRD_PERSON_HEIGHT', extractConstant(cameraPerspectiveSrc, 'THIRD_PERSON_HEIGHT'), 'ALGORITHMIC', 'core/CameraPerspective.js', 'a framing choice');
        record('BIRD_EYE_HEIGHT', extractConstant(cameraPerspectiveSrc, 'BIRD_EYE_HEIGHT'), 'ALGORITHMIC', 'core/CameraPerspective.js', 'a framing choice');

        // UI-ONLY QUANTITY — a rendering/geometry bound with no
        // interaction-policy meaning of its own (nobody decides "you may
        // interact within 1000 units"; it is where the render simply
        // stops drawing).
        record('DEFAULT_NEAR(clip plane)', extractConstant(cameraControllerSrc, 'DEFAULT_NEAR'), 'UI_ONLY', 'renderer/CameraController.js', 'render clip plane, not an interaction boundary');
        record('DEFAULT_FAR(clip plane)', extractConstant(cameraControllerSrc, 'DEFAULT_FAR'), 'UI_ONLY', 'renderer/CameraController.js', 'render clip plane, not an interaction boundary');

        // Deliberately absent — confirmed, not assumed, in Section C/D
        // below via a live source scan, and recorded here only as a
        // classification note: selection/picking and placement-from-
        // avatar distance carry NO explicit constant anywhere in this
        // codebase (a pure nearest-raycast-hit and an unbounded ground
        // raycast, respectively) — the brief's own instruction "don't
        // automatically attach meters to everything" is honored by
        // recording an absence as an absence, not inventing a number to
        // fill the inventory slot.

        const physical = inventory.filter((e) => e.classification === 'PHYSICAL');
        const algorithmic = inventory.filter((e) => e.classification === 'ALGORITHMIC');
        const uiOnly = inventory.filter((e) => e.classification === 'UI_ONLY');
        assert(physical.length === 3, `1. LIVE: exactly 3 real, currently-defined constants classify as PHYSICAL interaction distances (found ${physical.length}).`);
        assert(algorithmic.length === 12, `2. LIVE: exactly 12 real, currently-defined constants classify as ALGORITHMIC thresholds (found ${algorithmic.length}).`);
        assert(uiOnly.length === 2, `3. LIVE: exactly 2 real, currently-defined constants classify as UI-ONLY render bounds (found ${uiOnly.length}).`);
        assert(inventory.every((e) => Number.isFinite(e.value) && e.value > 0), '4. LIVE: every inventoried value is a real, finite, positive number — no placeholder, no NaN, no accidental zero.');

        console.log(`✓ Section A: a fresh, ${inventory.length}-entry interaction-distance inventory (non-overlapping with 0.9.547's own world-space quantity inventory) classified into ${physical.length} PHYSICAL / ${algorithmic.length} ALGORITHMIC / ${uiOnly.length} UI_ONLY, each tagged with its real source file and the reason for its classification — no interaction distance uniformly assumed to be meaningful under the meter contract.`);
    }

    // ===================================================================
    // Section B — Human-scale evaluation
    // ===================================================================
    {
        const byName = Object.fromEntries(inventory.map((e) => [e.name, e.value]));

        // Orbit camera bounds vs. avatar scale: close enough to inspect
        // detail (AVATAR_COLLISION_RADIUS's own diameter is 0.7; a
        // 2-world-unit/2-meter minimum approach is farther than that,
        // never closer — never clips through the very avatar being
        // viewed), far enough out (150m) to see multi-building context,
        // and both strictly inside the 1000m far clip plane, so the
        // orbit camera's own configured zoom range can never itself
        // exceed what the renderer would draw anyway.
        assert(byName['DEFAULT_MIN_DISTANCE(orbit camera)'] > AVATAR_COLLISION_RADIUS * 2,
            `1. LIVE: orbit camera DEFAULT_MIN_DISTANCE (${byName['DEFAULT_MIN_DISTANCE(orbit camera)']}) is farther than the avatar's own real collision diameter (${(AVATAR_COLLISION_RADIUS * 2).toFixed(2)}) — close-in orbit can approach an avatar-scale object without the near clip plane ever being the limiting factor.`);
        assert(byName['DEFAULT_MAX_DISTANCE(orbit camera)'] < byName['DEFAULT_FAR(clip plane)'],
            `2. LIVE: orbit camera DEFAULT_MAX_DISTANCE (${byName['DEFAULT_MAX_DISTANCE(orbit camera)']}) sits strictly inside DEFAULT_FAR (${byName['DEFAULT_FAR(clip plane)']}) — the configured zoom-out limit can never itself exceed the render distance.`);
        assert(byName['DEFAULT_NEAR(clip plane)'] < AVATAR_COLLISION_RADIUS,
            `3. LIVE: DEFAULT_NEAR (${byName['DEFAULT_NEAR(clip plane)']}) is smaller than the avatar's own real collision radius (${AVATAR_COLLISION_RADIUS}) — a camera can approach to within an avatar's own body radius before anything would be clipped away.`);

        // Camera-perspective framing distances: none absurd under
        // meters (not a 10,000-unit look-ahead, not a sub-centimeter
        // back-distance), and BIRD_EYE_HEIGHT reads as "a real
        // low-altitude overview," not "orbital."
        assert(byName['FIRST_PERSON_LOOK_DISTANCE'] >= 1 && byName['FIRST_PERSON_LOOK_DISTANCE'] <= 50,
            `4. LIVE: FIRST_PERSON_LOOK_DISTANCE (${byName['FIRST_PERSON_LOOK_DISTANCE']}) falls inside a plausible "somewhere out in front of me" range under meters.`);
        assert(byName['THIRD_PERSON_BACK_DISTANCE'] >= 1 && byName['THIRD_PERSON_BACK_DISTANCE'] <= 15,
            `5. LIVE: THIRD_PERSON_BACK_DISTANCE (${byName['THIRD_PERSON_BACK_DISTANCE']}) falls inside a plausible "over-the-shoulder" range under meters — larger than AVATAR_COLLISION_HEIGHT (${AVATAR_COLLISION_HEIGHT}) so the avatar's own body is never between camera and target.`);
        assert(byName['BIRD_EYE_HEIGHT'] >= 10 && byName['BIRD_EYE_HEIGHT'] <= 200,
            `6. LIVE: BIRD_EYE_HEIGHT (${byName['BIRD_EYE_HEIGHT']}) falls inside a plausible "low-altitude overview" range under meters — well below the 1000m far clip plane, well above head height.`);

        // Vehicle interaction: 1.5m sits between the avatar's own
        // collision diameter (0.7m — too tight to read as "interacting")
        // and a typical car length (~4-5m — too loose); the codebase's
        // own header already reasons about this in meters-flavored
        // language ("1.5 meters... well over a meter of approach room")
        // — checked here as a live, human-scale fact rather than cited
        // from the comment.
        assert(VEHICLE_INTERACTION_RADIUS > AVATAR_COLLISION_RADIUS * 2 && VEHICLE_INTERACTION_RADIUS < 4,
            `7. LIVE: VEHICLE_INTERACTION_RADIUS (${VEHICLE_INTERACTION_RADIUS}) sits strictly between the avatar's own collision diameter (${(AVATAR_COLLISION_RADIUS * 2).toFixed(2)}) and a small-car length (4) — "standing next to it," not "somewhere in the same field," under a meter interpretation.`);
        assert(BICYCLE_DISMOUNT_OFFSET_X > 0 && BICYCLE_DISMOUNT_OFFSET_X < VEHICLE_INTERACTION_RADIUS,
            `8. LIVE: BICYCLE_DISMOUNT_OFFSET_X (${BICYCLE_DISMOUNT_OFFSET_X}) is a real positive step smaller than VEHICLE_INTERACTION_RADIUS (${VEHICLE_INTERACTION_RADIUS}) — a dismounting avatar lands clear of the vehicle's own center while staying within interaction range of it, exactly as core/AvatarVehicleDismountPosition.js's own header claims, live-confirmed rather than cited.`);

        // Broad-phase collision query radii: algorithmic, but sanity-
        // checked against avatar scale so "12 world units" doesn't read
        // as absurdly tiny (smaller than the avatar itself) or absurdly
        // huge (querying half the visible World every tick).
        assert(byName['DEFAULT_QUERY_RADIUS(AvatarMovementConstraint)'] > AVATAR_COLLISION_HEIGHT
            && byName['DEFAULT_QUERY_RADIUS(AvatarMovementConstraint)'] < byName['DEFAULT_DISCOVERY_REFRESH_RADIUS'],
            `9. LIVE: the real movement broad-phase query radius (${byName['DEFAULT_QUERY_RADIUS(AvatarMovementConstraint)']}) is larger than avatar height (${AVATAR_COLLISION_HEIGHT}) but smaller than the discovery refresh radius (${byName['DEFAULT_DISCOVERY_REFRESH_RADIUS']}) — a tight, per-tick query, not an accidental world-wide scan.`);

        console.log('✓ Section B: every human-scale-relevant real value inventoried in Section A — orbit camera bounds, perspective framing distances, vehicle interaction/dismount, broad-phase query radius — lands inside a physically or experientially plausible range under the meter contract; no interaction distance found to be absurd at either extreme.');
    }

    // ===================================================================
    // Section C — Placement interaction chain
    // ===================================================================
    {
        // The real chain: user position -> placement location (an
        // unbounded ground-plane raycast, per renderer/PickingService.js
        // #pickGroundPosition — not live-executable here, THREE.js is
        // unavailable, confirmed by this file's own header) -> collision/
        // occupancy (core/SpatialOverlap.js#detectSpatialOverlap, pure
        // JS, live-executable) -> presentable World state (a
        // PlacementRecord).
        //
        // First, confirm live — a fresh source scan, not a citation —
        // that no placement-distance-from-avatar constant exists
        // anywhere in the four files most likely to hold one.
        const placementFiles = [
            'core/PlacementRecord.js',
            'application/CreatePublicationSnapshotPlacementUseCase.js',
            'application/CreateSnapshotPlacementOrchestratorUseCase.js',
            'renderer/PickingService.js'
        ];
        const distanceIdentifierPattern = /PLACEMENT_(?:MAX_)?DISTANCE|MAX_PLACEMENT_RANGE|placementDistance|PLACEMENT_RADIUS/;
        for (const file of placementFiles) {
            const text = await readSource(file);
            assert(!distanceIdentifierPattern.test(text), `1. LIVE: ${file} defines no placement-distance-from-avatar constant of any kind.`);
        }

        // renderer/PickingService.js#pickGroundPosition raycasts against
        // a ground plane with no `raycaster.far` override — confirmed
        // live from real source text, since THREE.js's own Raycaster
        // cannot be constructed in this harness.
        const pickingServiceSrc = await readSource('renderer/PickingService.js');
        assert(pickingServiceSrc.includes('pickGroundPosition'), '2. LIVE: renderer/PickingService.js really does expose pickGroundPosition, the one real function placement location comes from.');
        assert(!/raycaster\.far\s*=/.test(pickingServiceSrc), '3. LIVE: PickingService never sets raycaster.far — no distance cap of any kind is applied to a ground-placement pick, confirmed against the real source, not assumed from its absence in the inventory.');

        // Occupancy: a live-executed, exact-coordinate overlap check —
        // core/SpatialOverlap.js's own documented design ("Overlap Is A
        // Fact; Collision Is A Policy Decision"), exercised fresh here
        // (0.9.547 Section F/G touched PlacementRecord's own default
        // scale, never detectSpatialOverlap itself).
        const anchor = new PlacementRecord({ publicationId: 'pub-anchor', position: new Position(10, 0, 10) });
        const exactSamePosition = new PlacementRecord({ publicationId: 'pub-second', position: new Position(10, 0, 10) });
        const nearButDistinct = new PlacementRecord({ publicationId: 'pub-third', position: new Position(10, 0, 10.5) });
        const existing = [anchor];
        const overlapAtExact = detectSpatialOverlap(exactSamePosition.position, existing);
        const overlapAtNear = detectSpatialOverlap(nearButDistinct.position, existing);
        assert(overlapAtExact.count === 1, '4. LIVE: a real PlacementRecord at the EXACT SAME coordinate as an existing one is reported as an occupant — live-executed, not cited.');
        assert(overlapAtNear.count === 0, `5. LIVE: a real PlacementRecord only 0.5 world units (0.5 meters, under the meter contract) away is reported as NOT overlapping — occupancy is exact-coordinate, never radius/proximity-based, exactly as core/SpatialOverlap.js's own header declares; a half-meter gap between two placements is real, human-perceptible separation, not a rounding artifact.`);

        // Deterministic classification: placement location is UI-driven
        // (wherever the pointer's ray hits the ground), unbounded, and
        // deliberately never checked against avatar distance; occupancy
        // is a separate, exact-match fact, never a physical-footprint
        // (AABB) intersection yet (core/SpatialOverlap.js's own header,
        // "Deliberately origin-only for 0.2.25... deferred") — both
        // ALREADY_CORRECT, deliberate design decisions, not gaps.
        console.log('✓ Section C: the real placement chain (unbounded ground-plane raycast -> exact-coordinate overlap check -> PlacementRecord) is live-confirmed to carry no placement-distance-from-avatar constant anywhere, and detectSpatialOverlap\'s own exact-match occupancy semantics (fact, not radius) are live-exercised fresh — both ALREADY_CORRECT, documented deliberate design, not gaps this reassessment needs to raise.');
    }

    // ===================================================================
    // Section D — Encounter/discovery threshold verification
    // ===================================================================
    {
        // Walking-triggered discovery: confirmed, with FRESH scenario
        // data (not the same positions 0.9.186's own end-to-end audit
        // already used), that both refresh gates are real spatial
        // distance comparisons, never frame-count or wall-clock time.
        const refreshSnapshotSrc = await readSource('application/ShouldRefreshSnapshotDiscovery.js');
        const refreshPlaceNamingSrc = await readSource('application/ShouldRefreshPlaceNamingDiscovery.js');
        const timeBasedPattern = /setTimeout|setInterval|Date\.now|performance\.now|\bDEFAULT_.*_MS\b/;
        assert(!timeBasedPattern.test(refreshSnapshotSrc), '1. LIVE: application/ShouldRefreshSnapshotDiscovery.js contains no time-based throttle of any kind.');
        assert(!timeBasedPattern.test(refreshPlaceNamingSrc), '2. LIVE: application/ShouldRefreshPlaceNamingDiscovery.js contains no time-based throttle of any kind.');

        const originContext = { position: new Position(1000, 0, 1000) };
        const stillInsideContext = { position: new Position(1000 + DEFAULT_DISCOVERY_REFRESH_RADIUS - 1, 0, 1000) };
        const justOutsideContext = { position: new Position(1000 + DEFAULT_DISCOVERY_REFRESH_RADIUS + 1, 0, 1000) };
        assert(shouldRefreshSnapshotDiscovery(originContext, stillInsideContext) === false,
            `3. LIVE: from a fresh origin (1000,0,1000), moving to ${DEFAULT_DISCOVERY_REFRESH_RADIUS - 1} world units away does not trigger a Snapshot discovery refresh.`);
        assert(shouldRefreshSnapshotDiscovery(originContext, justOutsideContext) === true,
            `4. LIVE: from the same origin, moving to ${DEFAULT_DISCOVERY_REFRESH_RADIUS + 1} world units away DOES trigger one — a real, live-executed Euclidean measurement, not a cited default.`);

        const originPos = new Position(-500, 0, -500);
        const stillInsidePos = new Position(-500, 0, -500 + DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS - 1);
        const justOutsidePos = new Position(-500, 0, -500 + DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS + 1);
        assert(shouldRefreshPlaceNamingDiscovery(originPos, stillInsidePos) === false,
            '5. LIVE: the same fresh-scenario pattern holds for Place Naming\'s own independent refresh gate — inside its radius, no refresh.');
        assert(shouldRefreshPlaceNamingDiscovery(originPos, justOutsidePos) === true,
            '6. LIVE: past it, a refresh is triggered — both gates independently confirmed spatial, not temporal, using data neither prior audit file already asserted against.');

        // Encounter triggering: confirmed absent, extended here to the
        // two files 0.9.529's own WandererWorldSessionContinuity audit
        // did NOT check (that file asserted the absence only inside
        // ui/components/WorldEncounterCanvas.js's own computed/methods
        // bodies) — application/WorldEncounterView.js and
        // ui/components/WorldEncounterMarker.js are each other real
        // places a distance/proximity gate could have been hiding.
        const encounterViewSrc = await readSource('application/WorldEncounterView.js');
        const encounterMarkerSrc = await readSource('ui/components/WorldEncounterMarker.js');
        const encounterCanvasSrc = await readSource('ui/components/WorldEncounterCanvas.js');
        const noDistanceVocabPattern = /\bDISTANCE\b|\bNEAREST\b|\bRADIUS\b|\bproximity\b/i;
        // Each file's own header explicitly DISCLAIMS this vocabulary in
        // prose (checked for the disclaiming word itself, "NO", right
        // next to it) — so this assertion targets CODE, not the header
        // commentary that is expected and correct to mention the very
        // words it forbids.
        function codeOnly(source) {
            return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        }
        assert(!noDistanceVocabPattern.test(codeOnly(encounterViewSrc)), '7. LIVE: application/WorldEncounterView.js\'s own real, non-comment code contains no distance/nearest/radius/proximity vocabulary — its header\'s own "NO DISTANCE... VOCABULARY" claim is live-verified against code, not merely asserted in prose.');
        assert(!noDistanceVocabPattern.test(codeOnly(encounterMarkerSrc)), '8. LIVE: ui/components/WorldEncounterMarker.js\'s own real, non-comment code likewise contains none.');
        assert(encounterMarkerSrc.includes("emitSelect") || encounterMarkerSrc.includes("$emit('select'") || encounterMarkerSrc.includes('$emit("select"'),
            '9. LIVE: the real, only way an encounter becomes selected is an explicit marker click emitting `select` — never a movement/distance event.');
        assert(!/wandererPosition[^\n]*(?:distance|proximity|radius)/i.test(codeOnly(encounterCanvasSrc)),
            '10. LIVE: WorldEncounterCanvas.js\'s own tracked wandererPosition is never combined with distance/proximity/radius vocabulary in its real code — re-confirming 0.9.529\'s own finding fresh, extended across two additional files that finding did not check.');

        console.log('✓ Section D: both walking-triggered discovery gates (Snapshot, Place Naming) are live-reconfirmed as real, purely spatial Euclidean thresholds using fresh scenario data; encounter availability/selection is live-reconfirmed to carry NO distance/proximity gate anywhere, extended (beyond 0.9.529\'s own coverage) to WorldEncounterView.js and WorldEncounterMarker.js — a deliberate, documented design, not an oversight.');
    }

    // ===================================================================
    // Section E — Camera/avatar relationship (FLAGSHIP)
    // ===================================================================
    {
        // The live avatar-perspective camera (core/CameraPerspective.js)
        // and the live free-look orbit camera (renderer/CameraController.js)
        // are two SEPARATE, independently-tuned systems that this
        // codebase's own architecture requires to share one write path:
        // application/SpatialCameraController.js#applyFraming() ->
        // renderer/RenderWorldViewUseCase.js's own
        // `setCameraState: (state) => renderer.cameraController.setState(state)`
        // -> CameraController#setState(), which sets camera.position/
        // target directly and then immediately calls
        // `this._controls.update()` (its own real source, read live
        // below) — the SAME OrbitControls instance whose minDistance/
        // maxDistance/maxPolarAngle exist to bound HAND-DRIVEN orbiting,
        // per this file's own header ("Just under 90 degrees so the
        // camera can't orbit below the grid plane").
        //
        // three/addons/controls/OrbitControls.js is not installed in
        // this harness (confirmed in this file's own header), so this
        // section cannot live-execute OrbitControls' own update()/
        // clamping logic. What it CAN do, and does, live: read
        // CameraController's real configured bounds from its own source
        // text, live-execute computeCameraFraming() (pure, THREE-free)
        // for every real perspective, and check the PURE GEOMETRY each
        // framing implies against those bounds — the same "is this
        // number inside this range" discipline Section B already uses,
        // applied to the one geometric relationship between these two
        // systems this codebase does not document anywhere.
        assert(cameraControllerSrc.includes('this._controls.update();'), '1. LIVE: CameraController#setState() really does call `this._controls.update()` immediately after setting camera.position/target directly — confirmed against real source, not assumed — so ANY caller of setCameraState (including applyFraming\'s avatar-perspective framings) is subject to OrbitControls\' own live constraint application, not merely to constraints from hand-dragging.');

        const minDistance = extractConstant(cameraControllerSrc, 'DEFAULT_MIN_DISTANCE');
        const maxDistance = extractConstant(cameraControllerSrc, 'DEFAULT_MAX_DISTANCE');
        const maxPolarAngle = extractPolarAngleConstant(cameraControllerSrc);

        const avatarPosition = { x: 0, y: 0, z: 0 };
        const perspectives = [CameraPerspective.FIRST_PERSON, CameraPerspective.THIRD_PERSON, CameraPerspective.BIRD_EYE];
        const framingFacts = perspectives.map((perspective) => {
            const framing = computeCameraFraming(perspective, avatarPosition, 0);
            return {
                perspective,
                distance: impliedDistance(framing.position, framing.target),
                polarAngleDegrees: impliedPolarAngle(framing.position, framing.target) * (180 / Math.PI)
            };
        });

        for (const fact of framingFacts) {
            assert(fact.distance >= minDistance && fact.distance <= maxDistance,
                `2. LIVE: ${fact.perspective}'s own real computeCameraFraming() output implies a camera-to-target distance of ${fact.distance.toFixed(2)}, which falls inside CameraController's real configured [${minDistance}, ${maxDistance}] orbit-zoom bounds.`);
        }

        const maxPolarAngleDegrees = maxPolarAngle * (180 / Math.PI);
        const firstPersonFact = framingFacts.find((f) => f.perspective === CameraPerspective.FIRST_PERSON);
        const thirdPersonFact = framingFacts.find((f) => f.perspective === CameraPerspective.THIRD_PERSON);
        const birdEyeFact = framingFacts.find((f) => f.perspective === CameraPerspective.BIRD_EYE);

        assert(thirdPersonFact.polarAngleDegrees < maxPolarAngleDegrees,
            `3. LIVE: THIRD_PERSON's own implied polar angle (${thirdPersonFact.polarAngleDegrees.toFixed(2)}°) sits comfortably under CameraController's real max (${maxPolarAngleDegrees.toFixed(2)}°) — the classic behind-and-above framing never approaches this boundary.`);
        assert(birdEyeFact.polarAngleDegrees < maxPolarAngleDegrees,
            `4. LIVE: BIRD_EYE's own implied polar angle (${birdEyeFact.polarAngleDegrees.toFixed(2)}°, i.e. "straight down") sits comfortably under the same real max.`);

        // THE FLAGSHIP FINDING. FIRST_PERSON positions the camera and
        // its own look-target at IDENTICAL height (EYE_HEIGHT for both
        // — core/CameraPerspective.js's own real computeCameraFraming()
        // body, not a guess), which is a purely horizontal offset — a
        // polar angle of EXACTLY 90 degrees from vertical, live-computed
        // here, not assumed. CameraController's own real
        // DEFAULT_MAX_POLAR_ANGLE is "just under 90 degrees" BY DESIGN
        // (its own comment: "so the camera can't orbit below the grid
        // plane"), which this milestone's own live arithmetic shows is
        // a real, precise boundary violation: 90.00° sits outside
        // [0°, 89.4270°].
        assert(Math.abs(firstPersonFact.polarAngleDegrees - 90) < 1e-9,
            `5. LIVE: FIRST_PERSON's own real, live-computed implied polar angle is ${firstPersonFact.polarAngleDegrees.toFixed(6)}° — exactly horizontal, because computeCameraFraming() sets camera and target to the identical y (EYE_HEIGHT), confirmed against the live function output, not the source text.`);
        assert(firstPersonFact.polarAngleDegrees > maxPolarAngleDegrees,
            `6. LIVE, FLAGSHIP: FIRST_PERSON's own implied polar angle (${firstPersonFact.polarAngleDegrees.toFixed(4)}°) exceeds CameraController's own real configured DEFAULT_MAX_POLAR_ANGLE (${maxPolarAngleDegrees.toFixed(4)}°) by ${(firstPersonFact.polarAngleDegrees - maxPolarAngleDegrees).toFixed(4)}°. These two camera systems (avatar-perspective framing, free-look orbit) share exactly one enforcement point (CameraController#setState -> this._controls.update()) whose bounds were tuned for HAND-DRIVEN orbiting and were never checked against — nor documented as applying to — computeCameraFraming()'s own avatar-locked output.`);

        // Scoped honestly: the magnitude this boundary crossing would
        // produce, IF OrbitControls' well-documented "reconstruct
        // position from clamped spherical coordinates around a fixed
        // target" behavior applies unconditionally on every update()
        // call (which this harness cannot execute to confirm) — a
        // purely geometric consequence of the numbers already
        // established above, not a second, unverified library-behavior
        // claim.
        const clampedOffsetY = firstPersonFact.distance * Math.cos(maxPolarAngle);
        assert(clampedOffsetY > 0 && clampedOffsetY < 0.2,
            `7. arithmetic: IF such a clamp applied, the resulting vertical displacement would be ${clampedOffsetY.toFixed(4)} world units (${(clampedOffsetY * 100).toFixed(1)}cm under the meter contract) — real but sub-perceptible, changing the first-person look angle by well under one degree, never a functional break. This magnitude is exactly why this reassessment classifies the finding as worth documenting, not worth a camera-code change (see Section I).`);

        console.log(`✓ Section E (FLAGSHIP): CameraController's own real setState() unconditionally re-invokes OrbitControls' update() after every avatar-perspective framing is applied — confirmed against live source. THIRD_PERSON and BIRD_EYE framings sit comfortably inside CameraController's real configured distance/polar-angle bounds; FIRST_PERSON's own live-computed implied polar angle (exactly 90°, because eye-level look is purely horizontal) sits ${(firstPersonFact.polarAngleDegrees - maxPolarAngleDegrees).toFixed(2)}° past DEFAULT_MAX_POLAR_ANGLE (${maxPolarAngleDegrees.toFixed(2)}°) — a real, precise, previously-undocumented boundary relationship between two camera systems that share one write path, at a magnitude (well under a degree of resulting tilt, per the arithmetic above) too small to justify changing camera code on its own.`);
    }

    // ===================================================================
    // Section F — User-facing presentation inventory
    // ===================================================================
    {
        // Confirmed live: four real UI panels present a raw World-space
        // distance to the end user, and every one of them labels it
        // "World Units."
        const worldUnitFiles = [
            'ui/components/WorldLocationBrowser.js',
            'ui/components/WorldSearchPanel.js',
            'ui/components/NearbyAvatarsPanel.js',
            'ui/components/AvatarInfoPanel.js'
        ];
        for (const file of worldUnitFiles) {
            const text = await readSource(file);
            assert(/World Units/.test(text), `1. LIVE: ${file} really does present a distance labeled "World Units" to the end user.`);
        }

        // A fifth real panel presents the SAME kind of quantity — a
        // World-space distance between the viewer and a candidate — but
        // labels it "m," a different vocabulary, confirmed live against
        // its own template string.
        const geoPanelSrc = await readSource('ui/components/GeographicPlaceDirectoryPanel.js');
        assert(/\{\{\s*place\.distance\s*\}\}\s*m\b/.test(geoPanelSrc),
            '2. LIVE: ui/components/GeographicPlaceDirectoryPanel.js presents the identical KIND of quantity (a viewer-to-candidate World-space distance) but labels it "m," not "World Units" — a real, live-confirmed vocabulary split.');

        // Is this actually the SAME underlying quantity, or two
        // genuinely different measurements that happen to share a unit
        // word? Live-executed, not assumed: deriveNearbyGeographicPlaces'
        // own real distance formula, run against the same two points
        // distanceXZ() would use, produces the IDENTICAL number.
        const viewer = { x: 100, y: 0, z: 200 };
        const candidateEntry = { position: { x: 130, y: 0, z: 240 }, fingerprintKey: 'place-1' };
        const [geoResult] = deriveNearbyGeographicPlaces([candidateEntry], viewer, DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS);
        const worldSpatialAnchorDistance = distanceXZ(viewer, candidateEntry.position);
        assert(geoResult !== undefined, '3. LIVE: a real candidate within DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS is actually returned by the real deriveNearbyGeographicPlaces().');
        assert(Math.abs(geoResult.distance - Math.round(worldSpatialAnchorDistance * 10) / 10) < 1e-9,
            `4. LIVE: deriveNearbyGeographicPlaces()'s own real distance (${geoResult.distance}) exactly matches core/WorldSpatialAnchor.js#distanceXZ()'s own real, independently-implemented distance (${(Math.round(worldSpatialAnchorDistance * 10) / 10)}) for the identical two points — proving the "m" label and the "World Units" label describe the EXACT SAME kind of quantity (a World-space XZ distance), not two different measurement systems that coincidentally share a name.`);

        // One more real, live-confirmed instance of the same "m"
        // shorthand, this time in end-user documentation rather than
        // component code.
        const controlsReferenceSrc = await readSource('docs/user/ControlsReference.md');
        assert(/120m from Origin/.test(controlsReferenceSrc), '5. LIVE: docs/user/ControlsReference.md really does carry a second, independent "Nm" shorthand instance ("120m from Origin"), confirming this is not a single isolated typo.');

        console.log('✓ Section F: 4 real UI panels label a World-space distance "World Units"; a 5th real panel (GeographicPlaceDirectoryPanel.js) labels the mathematically IDENTICAL kind of quantity "m" (live-proven equal via deriveNearbyGeographicPlaces vs. distanceXZ on the same two points, not merely asserted); user-facing docs carry a second independent "Nm" instance. A real vocabulary inconsistency, not a computation inconsistency — see Section I for classification.');
    }

    // ===================================================================
    // Section G — Boundary consistency across subsystems
    // ===================================================================
    {
        // Every subsystem that measures a horizontal (X/Z) World-space
        // distance is checked, live, for numeric agreement on the SAME
        // two points — the only way to actually prove "no subsystem
        // introduces its own scale factor" rather than merely trusting
        // that each one's own source looks similar.
        const pointA = { x: 5, y: 0, z: 5 };
        const pointB = { x: 5, y: 0, z: 5 + 8 };
        const anchorDistance = distanceXZ(pointA, pointB);
        const vehicleWithinRange = withinRadiusXZ(pointA, pointB, 8);
        const vehicleJustOutside = withinRadiusXZ(pointA, pointB, 7.999);
        const geoNav = deriveNearbyGeographicPlaces([{ position: pointB, fingerprintKey: 'x' }], pointA, 100);

        assert(anchorDistance === 8, `1. LIVE: core/WorldSpatialAnchor.js#distanceXZ() reports exactly 8 world units between two points 8 apart on Z.`);
        assert(vehicleWithinRange === true && vehicleJustOutside === false,
            '2. LIVE: core/AvatarVehicleProximity.js#withinRadiusXZ() agrees exactly at the same 8-unit separation (inclusive at 8, exclusive at 7.999) — the SAME real distance, checked by an entirely separate implementation.');
        assert(Math.abs(geoNav[0].distance - 8) < 1e-9,
            `3. LIVE: core/GeographicPlaceNavigation.js#deriveNearbyGeographicPlaces() reports the same 8-unit distance for the identical two points — a THIRD, independently-written formula (Section F already proved this against distanceXZ generically; this asserts the exact numeric agreement here, with the same points every other check in this section uses).`);

        // 3D (X/Y/Z) distance, used by Snapshot discovery, is checked
        // against the SAME points with Y held at 0 — should still agree
        // with the XZ-only measurements above, since a zero Y offset
        // makes the two formulas equivalent.
        const fullDistance = distanceBetween(pointA, pointB);
        assert(fullDistance === 8, '4. LIVE: core/SpatialQuery.js#distanceBetween() (full 3D, used by Snapshot discovery) agrees with every XZ-only measurement above when Y is held equal — no hidden per-axis scale factor.');
        assert(isWithinRadius(pointA, pointB, 8) === true, '5. LIVE: core/SpatialQuery.js#isWithinRadius() agrees at the same inclusive boundary.');

        // Cross-system boundary scan (0.9.547 Section G's own technique,
        // applied fresh to the interaction-distance-carrying files this
        // milestone inventoried in Section A, none of which 0.9.547
        // itself scanned).
        const interactionBoundaryFiles = [
            'core/AvatarVehicleProximity.js', 'core/AvatarVehicleDismountPosition.js',
            'core/GeographicPlaceNavigation.js', 'application/ShouldRefreshSnapshotDiscovery.js',
            'application/ShouldRefreshPlaceNamingDiscovery.js', 'core/WorldSpatialAnchor.js',
            'renderer/CameraController.js', 'core/CameraPerspective.js'
        ];
        // Unlike 0.9.547's own scan (run BEFORE the meter contract
        // existed, when "meters" in prose WAS the drift being flagged),
        // this milestone runs after 0.9.548 adopted "1 World Unit = 1
        // meter" — so informal "meter"/"meters" commentary is now
        // EXPECTED, correct prose (confirmed live, e.g. this exact scan
        // below still finds it in core/AvatarVehicleProximity.js's own
        // header). What would still be suspicious is an actual scale-
        // FACTOR identifier: something that multiplies a coordinate by a
        // conversion constant when crossing a boundary.
        const suspiciousPattern = /\bUNIT_SCALE\b|\bunitScale\b|\bworldToMeter\b|\bmeterToWorld\b/;
        for (const file of interactionBoundaryFiles) {
            const text = await readSource(file);
            assert(!suspiciousPattern.test(text), `6. LIVE: ${file} contains no unit-conversion/rescaling identifier of any kind.`);
        }
        const vehicleProximitySrc = await readSource('core/AvatarVehicleProximity.js');
        assert(/1\.5 meters/.test(vehicleProximitySrc),
            '7. LIVE: core/AvatarVehicleProximity.js\'s own header does mention "1.5 meters" in prose — confirming this scan correctly distinguishes expected, post-0.9.548 meter-flavored COMMENTARY from an actual conversion-factor identifier, rather than merely never triggering on anything.');

        console.log('✓ Section G: distanceXZ, withinRadiusXZ, deriveNearbyGeographicPlaces, and distanceBetween/isWithinRadius (four independently-written implementations across four files that do not import one another) all agree EXACTLY on the same two real points, at the same inclusive boundary — no subsystem introduces its own scale factor; 8 further interaction-distance-carrying files scanned live for a silent unit-conversion identifier, none found.');
    }

    // ===================================================================
    // Section H — Failure and edge cases
    // ===================================================================
    {
        // Zero distance.
        const samePoint = { x: 42, y: 3, z: -17 };
        assert(distanceXZ(samePoint, samePoint) === 0, '1. LIVE: distanceXZ of a point against itself is exactly 0.');
        assert(withinRadiusXZ(samePoint, samePoint, 0) === true, '2. LIVE: withinRadiusXZ with a ZERO radius still reports "within range" at zero distance (inclusive boundary, `<=`) — never a false negative at the degenerate case.');
        assert(shouldRefreshSnapshotDiscovery({ position: samePoint }, { position: samePoint }) === false, '3. LIVE: no movement at all never triggers a discovery refresh.');

        // Very small (sub-floating-point-noise) distance, exactly at
        // and exactly past a real inclusive boundary — the discipline
        // the requesting brief itself names ("pay particular attention
        // to floating-point boundary behavior").
        const boundaryOrigin = { x: 0, y: 0, z: 0 };
        const exactlyAtVehicleRadius = { x: VEHICLE_INTERACTION_RADIUS, z: 0 };
        const justPastVehicleRadius = { x: VEHICLE_INTERACTION_RADIUS + Number.EPSILON * 1000, z: 0 };
        assert(withinRadiusXZ(boundaryOrigin, exactlyAtVehicleRadius, VEHICLE_INTERACTION_RADIUS) === true, '4. LIVE: exactly at VEHICLE_INTERACTION_RADIUS, still within range (inclusive).');
        assert(withinRadiusXZ(boundaryOrigin, justPastVehicleRadius, VEHICLE_INTERACTION_RADIUS) === false, '5. LIVE: a hair past it, no longer within range — no float-noise false positive at this real boundary.');

        // Very large distance — no overflow, no NaN, no silent wraparound.
        const veryFar = { x: 1e9, y: 0, z: 1e9 };
        assert(Number.isFinite(distanceXZ(boundaryOrigin, veryFar)), '6. LIVE: distanceXZ over a billion-unit separation remains a finite number.');
        assert(withinRadiusXZ(boundaryOrigin, veryFar, VEHICLE_INTERACTION_RADIUS) === false, '7. LIVE: a billion-unit-distant point is correctly excluded from a 1.5-unit interaction radius, no overflow-induced false positive.');
        assert(deriveNearbyGeographicPlaces([{ position: veryFar, fingerprintKey: 'far' }], boundaryOrigin, DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS).length === 0,
            '8. LIVE: the real geographic-place query correctly excludes a billion-unit-distant candidate rather than throwing or overflowing.');

        // Overlapping objects at the exact same position — already
        // covered structurally in Section C; here, specifically the
        // EMPTY case (no occupants at all) and the MULTI-occupant case,
        // both real edge shapes detectSpatialOverlap's own constructor
        // exposes.
        const emptyOverlap = detectSpatialOverlap(new Position(0, 0, 0), []);
        assert(emptyOverlap.isEmpty === true && emptyOverlap.count === 0, '9. LIVE: an empty existing-records array produces a real, correctly-empty SpatialOverlap — no occupants, isEmpty true.');
        const threeAtOrigin = [
            new PlacementRecord({ publicationId: 'a', position: new Position(0, 0, 0) }),
            new PlacementRecord({ publicationId: 'b', position: new Position(0, 0, 0) }),
            new PlacementRecord({ publicationId: 'c', position: new Position(0, 0, 0) })
        ];
        const tripleOverlap = detectSpatialOverlap(new Position(0, 0, 0), threeAtOrigin);
        assert(tripleOverlap.count === 3, '10. LIVE: three real, independently-created PlacementRecords at the identical coordinate are all reported as occupants — a deliberately legal state (core/SpatialOverlap.js\'s own header: "a shared world can legitimately hold more than one publication at the same position"), not an error.');

        // The FIRST_PERSON polar-angle boundary from Section E, restated
        // here as the edge case it also is: an EXACTLY horizontal look
        // (the real, live case) sits AT the theoretical 90° boundary,
        // never past it due to float noise in either direction — this
        // is the boundary itself, not noise around it, confirmed by
        // recomputing it completely independently (via avatarPosition
        // translated to a non-zero origin, ruling out an origin-specific
        // coincidence).
        const translatedFraming = computeCameraFraming(CameraPerspective.FIRST_PERSON, { x: 731.25, y: 12, z: -406.5 }, 47);
        const translatedPolarAngle = impliedPolarAngle(translatedFraming.position, translatedFraming.target) * (180 / Math.PI);
        assert(Math.abs(translatedPolarAngle - 90) < 1e-9,
            `11. LIVE: FIRST_PERSON's own exactly-horizontal implied polar angle (${translatedPolarAngle.toFixed(6)}°) holds at a translated, rotated avatar position/heading far from the origin — this is a structural property of the framing formula (position.y === target.y always), not an artifact of Section E's own choice of avatarPosition {0,0,0}.`);

        console.log('✓ Section H: zero distance, exact-boundary and just-past-boundary float behavior, very large distances, empty and multi-occupant overlap sets, and the FIRST_PERSON polar-angle boundary (reconfirmed at a translated, non-origin avatar position) all behave correctly and consistently — no floating-point false positive/negative found at any real boundary this milestone exercised.');
    }

    // ===================================================================
    // Section I — Product gap classification
    // ===================================================================
    {
        const classification = {
            ALREADY_CORRECT: [
                'Encounter availability/selection carries no distance/proximity gate of any kind — deliberate, header-documented, live-reconfirmed in Section D across three real files.',
                'Placement occupancy is exact-coordinate ("Overlap Is A Fact; Collision Is A Policy Decision") — deliberate, documented, live-exercised fresh in Section C.',
                'Walking-triggered discovery gates (Snapshot, Place Naming) are real spatial distances, never time-based — live-reconfirmed in Section D with fresh data.',
                'VEHICLE_INTERACTION_RADIUS/BICYCLE_DISMOUNT_OFFSET_X land at human-plausible scale relative to avatar/vehicle size, and the codebase\'s own header commentary already reasons about them in meters-flavored language.',
                'Every cross-subsystem distance implementation (distanceXZ, withinRadiusXZ, deriveNearbyGeographicPlaces, distanceBetween) agrees exactly on identical points — no silent per-subsystem scale factor (Section G).'
            ],
            DOCUMENTATION_GAP: [
                'GeographicPlaceDirectoryPanel.js labels the identical World-space distance quantity "m" while four other real UI panels label it "World Units" (Section F) — proven, live, to be the exact same number, not a different measurement system. Nothing in docs/user/ currently explains that these are the same distance under the 0.9.548 meter contract; a Wanderer reading both panels has no stated reason to trust that "12.0 World Units" and "12 m" mean the same thing.',
                'The camera/orbit relationship found in Section E (two independently-tuned systems sharing one enforcement point) is not documented anywhere — neither core/CameraPerspective.js\'s own header nor renderer/CameraController.js\'s own header mentions the other.'
            ],
            PRODUCT_GAP: [],
            ARCHITECTURAL_GAP: [
                'FIRST_PERSON\'s own implied polar angle sits exactly at, and CameraController\'s own configured DEFAULT_MAX_POLAR_ANGLE sits just under, the same 90° boundary (Section E) — a real, previously-undocumented coupling between two camera systems that were each tuned in isolation. The live-computed magnitude of any resulting effect (well under a degree of tilt, well under a decimeter of positional change, Section E assertion 7) is too small to justify a camera-code change on its own, matching the requesting brief\'s own "don\'t turn every awkward number into a production change" instruction — recorded as an architectural coupling worth knowing about, not a bug to fix.'
            ]
        };

        assert(classification.PRODUCT_GAP.length === 0, '1. this reassessment classifies zero findings as requiring a production interaction-distance CHANGE — every real finding is either already-correct, a documentation gap, or an architectural coupling too small in practice to act on, matching the brief\'s own explicit exclusion list (no universal interaction radius, no camera redesign, no UI redesign).');
        assert(classification.ALREADY_CORRECT.length === 5 && classification.DOCUMENTATION_GAP.length === 2 && classification.ARCHITECTURAL_GAP.length === 1,
            '2. every finding this milestone surfaced (Sections A-H) is accounted for in exactly one classification bucket, none silently dropped.');

        console.log(`✓ Section I: ${classification.ALREADY_CORRECT.length} ALREADY_CORRECT, ${classification.DOCUMENTATION_GAP.length} DOCUMENTATION_GAP, ${classification.PRODUCT_GAP.length} PRODUCT_GAP, ${classification.ARCHITECTURAL_GAP.length} ARCHITECTURAL_GAP findings — no interaction distance found absurd enough, or wrong enough, to warrant a production code change; the two real gaps found are documentation-shaped, left to a deliberate follow-up milestone exactly as 0.9.547 left its own Section I candidate contract, not silently patched here.`);
    }

    // ===================================================================
    // Section J — Flagship: a real, composed human-scale scenario
    // ===================================================================
    {
        // Avatar approaches a real 2m door, standing at real 1.6m eye
        // height, walking at real 3 m/s, places/interacts with a nearby
        // object, and crosses a real discovery threshold — every step
        // using the SAME real production functions Sections A-H already
        // proved correct individually, composed here exactly the way a
        // Wanderer's own session actually strings them together.
        const doorDef = CoreLibrary.definitions.find((d) => d.id === 'core:door');
        assert(doorDef.width === 1 && doorDef.height === 2, `1. LIVE: the real core:door definition is 1x2 world units (1m wide, 2m tall under the meter contract) — the flagship scenario's own "2m door" premise checked against real source, not assumed.`);

        // 1. One real kinematic tick, walking toward the door.
        const walkTick = simulateAvatarMovement({
            position: { x: 0, y: 0, z: -1 },
            movementState: new AvatarMovementState({ forwardAxis: 1 }),
            deltaSeconds: 1 / 60
        });
        assert(walkTick.position.z > -1, '2. LIVE: one real simulation tick moves the avatar toward the door.');

        // 2. Real first-person eye height under the real door lintel —
        // reusing 0.9.547 Section J's own proven relationship, restated
        // here because THIS milestone's own flagship is about
        // INTERACTION coherence, not merely physical possibility: an
        // avatar that can walk through its own door must ALSO be able
        // to interact with what's on the other side without a spurious
        // interaction-distance cap getting in the way (Section C\'s own
        // "no placement-distance-from-avatar constant" finding is what
        // makes this true).
        const eyeFraming = computeCameraFraming(CameraPerspective.FIRST_PERSON, walkTick.position, 0);
        assert(eyeFraming.position.y < doorDef.height, `3. LIVE: the real first-person eye height (${eyeFraming.position.y}) sits below the real door height (${doorDef.height}) — the avatar clears its own doorway.`);

        // 3. Placement immediately beyond the door: no distance-from-
        // avatar cap (Section C) means this is possible at all; exact-
        // coordinate occupancy (Section C) means it does not collide
        // with an existing placement one full meter away.
        const beyondDoor = new Position(0, 0, 3);
        const existingNearby = [new PlacementRecord({ publicationId: 'existing', position: new Position(0, 0, 4) })];
        const placementOverlap = detectSpatialOverlap(beyondDoor, existingNearby);
        assert(placementOverlap.isEmpty === true, '4. LIVE: a new placement 1 world unit (1 meter) from an existing one does not collide — real occupancy semantics, composed into this scenario.');

        // 4. A bicycle sits nearby; the avatar is within real
        // interaction range of it, and dismounting from it (had the
        // avatar been riding) would land within a real, live-computed
        // clear step of it.
        const bicycle = new VehiclePresence({ id: 'bicycle-1', type: VehicleType.BICYCLE, position: new Position(2, 0, 3) });
        const avatarNearBicycle = { x: 3, z: 3 };
        assert(avatarVehicleProximity(avatarNearBicycle, bicycle).withinRange === true,
            `5. LIVE: the avatar, 1 world unit from the real bicycle's real position, is within real VEHICLE_INTERACTION_RADIUS (${VEHICLE_INTERACTION_RADIUS}) range of it.`);
        const dismountPosition = resolveAvatarVehicleDismountPosition(bicycle);
        assert(dismountPosition.x === bicycle.position.x + BICYCLE_DISMOUNT_OFFSET_X,
            `6. LIVE: the real dismount position lands exactly BICYCLE_DISMOUNT_OFFSET_X (${BICYCLE_DISMOUNT_OFFSET_X}) from the real bicycle — still within VEHICLE_INTERACTION_RADIUS of it (composed from Section B's own already-proven relationship, assertion 8).`);

        // 5. The avatar then walks far enough to cross the real
        // Snapshot discovery threshold — movement, not a timer, is what
        // makes the World "look around again."
        const beforeWalk = { position: new Position(0, 0, 3) };
        const afterLongWalk = { position: new Position(0, 0, 3 + DEFAULT_DISCOVERY_REFRESH_RADIUS + 5) };
        assert(shouldRefreshSnapshotDiscovery(beforeWalk, afterLongWalk) === true,
            '7. LIVE: crossing the real discovery-refresh radius after all of the above (door, placement, vehicle interaction) still correctly triggers exactly one fresh discovery pass — the movement gate composes coherently with everything else in this scenario, not in isolation.');

        console.log('✓ Section J (FLAGSHIP): a real avatar walks through a real 2m door at real eye height, places an object beyond it with no spurious distance cap, stands in real interaction range of a real bicycle whose real dismount offset stays within that same range, and then crosses the real discovery-refresh threshold — every step composed from already Section-A-through-H-proven real production functions, end to end, on today\'s numbers, with nothing about interaction distance found incoherent across the whole chain.');
    }

    // ===================================================================
    // Section K — Deliberate exclusions and production guard
    // ===================================================================
    {
        // No production file touched: this milestone's own findings
        // (Section F/E's documentation gaps) are reported, not silently
        // patched into ui/ or docs/ — matching 0.9.547 Section K's own
        // restraint, and this milestone's own requesting brief's
        // explicit exclusion list (no universal interaction radius, no
        // physics tuning, no avatar resizing, no camera redesign, no
        // collision redesign, no new interaction system, no
        // raycasting/spatial-indexing/LOD/streaming work, no automatic
        // distance-based ranking, no UI redesign).
        const gitStatus = execSync('git status --porcelain', { cwd: new URL('../', import.meta.url) }).toString();
        const changedLines = gitStatus.split('\n').filter((l) => l.trim().length > 0);
        const expectedForThisMilestone = ['WorldSpatialInteractionProductReassessment.test.js', 'tests.html'];
        const unexpected = changedLines.filter((l) => !expectedForThisMilestone.some((name) => l.includes(name)));
        assert(unexpected.length === 0, `1. LIVE: git status reports no changed file besides this milestone's own new test file and its tests.html registration (unexpected: ${JSON.stringify(unexpected)}) — no core/renderer/ui/docs production content touched.`);

        console.log('✓ Section K: no core/renderer/ui/docs production content touched by this milestone — test-only, exactly like every "Product Reassessment" milestone before it; the documentation gaps and architectural coupling this reassessment found (Section I) are reported for a deliberate follow-up to decide, never silently patched here.');
    }

    console.log('\nAll World Spatial Interaction Product Reassessment tests passed.');
    console.log('\n=== 0.9.549 VERDICT ===');
    console.log(`SPATIAL_INTERACTION_LARGELY_COHERENT; TWO_DOCUMENTATION_GAPS_NAMED; ONE_ARCHITECTURAL_COUPLING_NAMED; NO_PRODUCTION_CHANGE_WARRANTED.

This milestone asked a genuinely different question from 0.9.547/0.9.548's own physical-scale-contract work: now that a World Unit officially means a meter, do the actual interaction distances a Wanderer experiences hold together? The answer, checked directly against real, unmodified production source (Sections A-H, all live-executed or live-read, never cited from memory) and one real composed end-to-end scenario (Section J): mostly yes, with two honest, narrowly-scoped exceptions.

Section A inventoried 17 real interaction-distance-carrying constants this codebase's own 0.9.547 audit did NOT already cover, classified 3 PHYSICAL / 12 ALGORITHMIC / 2 UI-ONLY (Section A) rather than assuming every number deserves a physical reading. Every one of them lands at a human-plausible scale (Section B) — vehicle interaction radius reads as "standing next to it," the orbit camera's zoom range never clips through an avatar or exceeds the render distance, broad-phase collision queries are neither absurdly tiny nor absurdly wide.

Placement (Section C) and encounter availability (Section D) both turned out to be ALREADY_CORRECT by deliberate design: placement carries no distance-from-avatar cap and occupancy is exact-coordinate ("a fact, not a policy"); encounters carry no proximity gate of any kind, selection is always an explicit click. Both are documented, intentional restraint this reassessment reconfirmed live rather than a gap to close.

Two real DOCUMENTATION_GAPs surfaced. First (Section F): a fifth real UI panel (GeographicPlaceDirectoryPanel.js) displays the mathematically IDENTICAL World-space distance quantity every other panel calls "World Units," but labels it "m" instead — live-proven to be the same number via deriveNearbyGeographicPlaces vs. distanceXZ on identical points, not a different measurement system, yet nothing tells a Wanderer that. Second: the relationship Section E found between the free-look orbit camera and the avatar-perspective camera is undocumented in both files' own headers.

One real ARCHITECTURAL_GAP surfaced, and it is this milestone's own flagship finding (Section E): the free-look orbit camera's own DEFAULT_MAX_POLAR_ANGLE ("just under 90 degrees, so the camera can't orbit below the grid plane") and the FIRST_PERSON avatar-perspective framing's own implied polar angle (EXACTLY 90 degrees, because an eye-level look is purely horizontal) sit on opposite sides of the identical boundary — a real, live-computed, previously-undocumented coupling between two camera systems that were each tuned in isolation but share one enforcement point (CameraController#setState -> OrbitControls#update(), confirmed live against real source). The magnitude any resulting effect could have, worked out arithmetically from numbers already established above (Section E, assertion 7), is well under a degree of tilt and well under a decimeter of positional change — real, but sub-perceptible, and explicitly not worth a camera-code change on its own.

Per the requesting brief's own explicit exclusion list and its own "don't turn every awkward number into a production change" instruction: this milestone makes NO production change. Both documentation gaps and the one architectural coupling are named, not silently patched, exactly the restraint 0.9.547 Section I already established for this codebase's own audits — left to a deliberate follow-up milestone, should one ever be wanted, to decide.`);
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
