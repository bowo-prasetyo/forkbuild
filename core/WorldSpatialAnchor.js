import { computeFacingYawDegrees } from './AvatarFacing.js';
import { WorldSpatialActivity } from './WorldSpatialActivity.js';

// 0.3.1 — Collaborative Spatial Awareness.
//
// 0.3.0 answered "where are my collaborators and what are they doing" —
// `WorldSpatialPresenceUseCase#getSpatialRoster()` hands back the raw,
// per-device observation (position, heading, selection, activity), and
// `renderer/RemoteSpatialPresenceRenderer.js`/`ui/components/WorldCollaboratorIndicator.js`
// draw it, one identical marker/row regardless of where the viewer's own
// camera happens to be. This milestone answers a narrower, purely
// PRESENTATIONAL question 0.3.0 deliberately left unasked: "what does
// this observation mean HERE, from where I'm standing" — the derived,
// rendering-oriented value this file's own name promises. A
// `WorldSpatialAnchor` is never a new network fact, never persisted,
// and never authoritative over anything: it's a pure function of a
// `WorldSpatialPresenceUseCase` observation plus the VIEWER's own local
// camera state, exactly one more rung on the chain this codebase has
// followed since 0.2.94:
//
//   WorldSpatialPresence   (0.3.0, the network observation)
//           |
//           v
//   WorldSpatialAnchor     (0.3.1, THIS file — a derived, local, purely
//                           presentational reading of it)
//           |
//           v
//   Renderer / UI
//
// deriveWorldSpatialAnchor() is the ONE place that reading is computed —
// a pure function of plain numbers a caller (application/
// WorldNavigationSession.js) already has lying around (its own camera
// position/heading, the remote device's reported position/heading/
// selection/activity, and an optional resolved "what is this selection
// pointing at" label) — never a THREE.js object, never something a
// remote participant can influence beyond the same position/heading/
// selection/activity 0.3.0 already lets them report. See
// docs/Principles.md, "A Spatial Anchor Is A Presentation Decision, Never
// Remote Authority (0.3.1)."
export const WorldSpatialProximityTier = Object.freeze({
    NEAR: 'near',
    MID: 'mid',
    FAR: 'far'
});

const VALID_TIERS = new Set(Object.values(WorldSpatialProximityTier));

export function isValidWorldSpatialProximityTier(value) {
    return VALID_TIERS.has(value);
}

// A remote participant standing this close reads as fully recognizable
// — worth a name and a full activity line. Beyond MID_DISTANCE there is
// no further cutoff: a marker is always shown for anyone actually in
// view (see isWithinViewCone below), just an increasingly quiet one —
// this milestone's own design conversation, "far away -> marker only,"
// never "far away -> gone."
const NEAR_DISTANCE = 12;
const MID_DISTANCE = 30;

// A generous, deliberately wide default field of view — this is a
// legibility heuristic ("is Bob roughly in front of me"), never a
// literal render-frustum culling pass (no aspect ratio, no near/far
// planes, no THREE.Camera anywhere in this file) — see this file's own
// header, "never a THREE.js object." A caller with the real camera's
// actual FOV may pass a narrower value; a caller with none at all (or
// no heading yet) gets `isWithinViewCone()`'s own "can't tell, default
// visible" answer below, never a false cull.
const DEFAULT_VIEW_CONE_DEGREES = 140;

export const WorldSpatialPresentationMode = Object.freeze({
    HIDDEN: 'hidden', // outside the viewer's own view cone — no 3D marker at all
    MARKER_ONLY: 'marker-only', // far away — a marker, no label
    MARKER_ABBREVIATED: 'marker-abbreviated', // moderately distant — marker + a short identity
    MARKER_FULL: 'marker-full' // nearby — marker + full name + activity
});

// Plain 2D (X/Z) Euclidean distance — every spatial-presence position in
// this codebase is already X/Z only (0.3.0's own `{ x, z }` shape;
// elevation is a rendered, terrain-derived fact, never a presence field —
// see core/WorldSpatialPresenceAdvertisement.js's own header), so this
// never needs a Y term.
export function distanceXZ(a, b) {
    if (!a || !b) {
        return null;
    }
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

export function deriveProximityTier(distance) {
    if (!Number.isFinite(distance)) {
        return WorldSpatialProximityTier.FAR;
    }
    if (distance <= NEAR_DISTANCE) {
        return WorldSpatialProximityTier.NEAR;
    }
    if (distance <= MID_DISTANCE) {
        return WorldSpatialProximityTier.MID;
    }
    return WorldSpatialProximityTier.FAR;
}

// "Is `targetPosition` roughly in front of a viewer standing at
// `viewerPosition`, facing `viewerHeadingDegrees`" — the SAME 0° faces
// +Z / 90° faces +X / clockwise-from-above convention
// core/CompassHeading.js already established, reusing
// core/AvatarFacing.js#computeFacingYawDegrees to compute the bearing
// TO the target rather than inventing a second angle formula. Degenerate
// or unknown inputs always resolve to VISIBLE, never hidden — this is a
// legibility nicety, and a caller that can't establish "behind you" has
// no business asserting it: a viewer with no heading yet (camera never
// moved), or a target standing exactly where the viewer is, is always
// shown.
export function isWithinViewCone(viewerPosition, viewerHeadingDegrees, targetPosition, fovDegrees = DEFAULT_VIEW_CONE_DEGREES) {
    if (!viewerPosition || !targetPosition || !Number.isFinite(viewerHeadingDegrees)) {
        return true;
    }
    const bearing = computeFacingYawDegrees(viewerPosition, targetPosition);
    if (bearing === null) {
        return true;
    }
    const delta = ((bearing - viewerHeadingDegrees + 540) % 360) - 180; // normalized to (-180, 180]
    return Math.abs(delta) <= fovDegrees / 2;
}

// The ONE place presentation mode is chosen from tier + visibility —
// "outside the view cone" always wins over distance, exactly the user-
// facing rule this milestone's own design conversation states: "outside
// the current camera/world view -> no 3D marker," regardless of how
// close that participant actually is.
export function derivePresentationMode(tier, visible) {
    if (visible === false) {
        return WorldSpatialPresentationMode.HIDDEN;
    }
    if (tier === WorldSpatialProximityTier.NEAR) {
        return WorldSpatialPresentationMode.MARKER_FULL;
    }
    if (tier === WorldSpatialProximityTier.MID) {
        return WorldSpatialPresentationMode.MARKER_ABBREVIATED;
    }
    return WorldSpatialPresentationMode.MARKER_ONLY;
}

// A small, deterministic, PRESENTATION-only truncation — never applied
// to anything but a display string a UI is about to draw into a fixed
// amount of space, exactly like renderer/RemoteSpatialPresenceRenderer.js's
// own canvas label already needed to fit inside LABEL_WIDTH before this
// milestone. Never itself a fact about the identity.
export function abbreviateIdentityLabel(label, maxLength = 10) {
    const text = typeof label === 'string' ? label : '';
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

// core/WorldSpatialActivity.js's own vocabulary, extended with an
// OPTIONAL contextual target noun — "Bob is BUILDING" becomes "Bob is
// Building House" the moment a caller can resolve WHAT Bob's own
// `WorldSpatialSelection` actually points at (see
// application/WorldNavigationSession.js#_resolveSpatialContextualLabel()).
// `contextualLabel` is deliberately just a display string, resolved
// entirely OUTSIDE this file — this function stays exactly as pure as
// deriveWorldSpatialActivity() itself, never reaching into a World or a
// document to look anything up on its own. A null/absent
// `contextualLabel` (the selection couldn't be resolved, or there is no
// selection at all) falls back to the exact phrase
// ui/components/WorldCollaboratorIndicator.js's own ACTIVITY_LABELS
// already used before this milestone — nothing regresses for a caller
// that never resolves one.
export function describeSpatialActivity(activity, contextualLabel = null) {
    const target = typeof contextualLabel === 'string' && contextualLabel.length > 0 ? contextualLabel : null;
    switch (activity) {
        case WorldSpatialActivity.BUILDING:
            return target ? `Building ${target}` : 'Building';
        case WorldSpatialActivity.MOVING_STRUCTURE:
            return target ? `Moving ${target}` : 'Moving a structure';
        case WorldSpatialActivity.ROTATING_STRUCTURE:
            return target ? `Rotating ${target}` : 'Rotating a structure';
        case WorldSpatialActivity.INSPECTING:
            return target ? `Inspecting ${target}` : 'Inspecting';
        case WorldSpatialActivity.WALKING:
            return 'Walking';
        case WorldSpatialActivity.IDLE:
        default:
            return 'Here';
    }
}

// A plain, read-only value object — deliberately as inert as
// core/WorldSpatialSelection.js itself: no methods beyond getters and
// equals(), nothing a mutation path could mistake for something it may
// act on. Never constructed directly outside this file's own
// deriveWorldSpatialAnchor() — see that function's own header.
export class WorldSpatialAnchor {
    constructor({
        deviceId, identityId, label, position, heading, selection, activity,
        contextualLabel, activityLabel, distance, tier, presentationMode
    } = {}) {
        this._deviceId = deviceId || null;
        this._identityId = identityId || null;
        this._label = label || '';
        this._position = position ? { x: position.x, z: position.z } : null;
        this._heading = Number.isFinite(heading) ? heading : null;
        this._selection = selection || null;
        this._activity = activity || WorldSpatialActivity.IDLE;
        this._contextualLabel = contextualLabel || null;
        this._activityLabel = activityLabel || describeSpatialActivity(this._activity, this._contextualLabel);
        this._distance = Number.isFinite(distance) ? distance : null;
        this._tier = isValidWorldSpatialProximityTier(tier) ? tier : WorldSpatialProximityTier.FAR;
        this._presentationMode = presentationMode || WorldSpatialPresentationMode.MARKER_FULL;
    }

    get deviceId() { return this._deviceId; }
    get identityId() { return this._identityId; }
    get label() { return this._label; }
    get position() { return this._position; }
    get heading() { return this._heading; }
    get selection() { return this._selection; }
    get activity() { return this._activity; }
    get contextualLabel() { return this._contextualLabel; }
    get activityLabel() { return this._activityLabel; }
    get distance() { return this._distance; }
    get tier() { return this._tier; }
    get presentationMode() { return this._presentationMode; }
    get isHidden() { return this._presentationMode === WorldSpatialPresentationMode.HIDDEN; }
}

// The one entry point a caller actually uses. `viewerPosition`/
// `viewerHeadingDegrees` are both optional — omitting either (a session
// with no camera yet) degrades to "always visible, tier computed from an
// unknown/Infinite distance" rather than throwing; see
// deriveProximityTier()/isWithinViewCone()'s own graceful-absence rules
// above.
export function deriveWorldSpatialAnchor({
    deviceId, identityId, label = '', position = null, heading = null,
    selection = null, activity = WorldSpatialActivity.IDLE,
    contextualLabel = null,
    viewerPosition = null, viewerHeadingDegrees = null,
    fovDegrees = DEFAULT_VIEW_CONE_DEGREES
} = {}) {
    const distance = distanceXZ(viewerPosition, position);
    const tier = deriveProximityTier(distance);
    const visible = isWithinViewCone(viewerPosition, viewerHeadingDegrees, position, fovDegrees);
    const presentationMode = derivePresentationMode(tier, visible);
    return new WorldSpatialAnchor({
        deviceId, identityId, label, position, heading, selection, activity,
        contextualLabel, distance, tier, presentationMode,
        activityLabel: describeSpatialActivity(activity, contextualLabel)
    });
}
