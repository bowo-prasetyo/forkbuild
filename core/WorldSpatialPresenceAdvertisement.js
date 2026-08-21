import { isValidWorldSpatialActivity } from './WorldSpatialActivity.js';
import { isValidWorldSpatialSelectionPayload } from './WorldSpatialSelection.js';

// 0.3.0 — Collaborative Spatial Presence.
//
// The wire shape of application/WorldSpatialPresenceUseCase.js's own
// protocol (`forkbuild:world-spatial-presence`) — a THIRD, separate
// protocol from `forkbuild:world-sync` (application/
// WorldCommandPropagationUseCase.js, durable World mutation) and
// `forkbuild:world-presence` (application/WorldPresenceUseCase.js, coarse
// "is this identity here at all" presence, 0.2.98). See
// docs/Principles.md, "Collaborative Spatial Presence Is Ephemeral
// Observation, Never World Content" (0.3.0):
//
//   world-sync             — durable: "this operation changes the World."
//   world-presence         — ephemeral, low-frequency: "this identity is
//                             currently here."
//   world-spatial-presence — ephemeral, HIGH-frequency: "this identity is
//                             currently looking/working here."
//
// Deliberately, permanently UNSIGNED — exactly the reasoning
// core/WorldPresenceAdvertisement.js's own header already gives, one
// notch further: a spatial presence advertisement is never meant to be
// believed beyond the single, currently-live, mutually-AUTHENTICATED
// connection it travels over, and the receiver always resolves WHO sent
// it from that live connection (`meta.connectedPeer.remoteIdentity`,
// device-resolved through DeviceAuthorizationPropagationUseCase),
// NEVER from anything this payload itself claims — there is no
// `identityId` field below on purpose. "Bob says Bob is standing at X"
// needs no cryptographic proof the way "Bob commands World A to delete
// House 17" does (core/WorldOperationEnvelope.js) — see this milestone's
// own design conversation, "Security model."
//
// `sequence` is a plain, per-CONNECTION monotonic counter — the same
// "not a CausalStamp" reasoning core/AvatarPresence.js's own header
// already gives for avatar movement, applied here too: one writer (this
// device's own live connection to a given peer), no offline-merge story,
// so a flat always-increasing integer is all ingestion needs
// (core/PresenceIngestion.js#resolveIncomingPresence(), reused
// unmodified — newest sequence always wins, out-of-order/duplicate/gapped
// delivery all handled by that one existing rule). Explicitly NOT a
// wall-clock timestamp used for correctness — see this milestone's own
// design conversation, "I would be careful about the word timestamp":
// nothing here ever compares two advertisements' clocks against each
// other to decide which is newer.
//
// `position` is `{ x, z }` only — never `y`. World View's terrain height
// at (x, z) is already a purely rendering-time fact
// (renderer/TerrainHeightField.js via Renderer#terrainHeightAt(), see
// application/RenderWorldViewUseCase.js's own `withGroundElevation()`
// for the avatar-rendering precedent this reuses) — broadcasting a
// sender's own local elevation reading would be redundant at best and a
// second, competing source of "where is the ground" at worst. A
// receiver rebuilds a remote marker's world-space Y the same way it
// already rebuilds a remote avatar's.
//
// `heading` is a raw camera-orientation float in DEGREES, using
// core/CompassHeading.js's own fixed convention (0° faces +Z, 90° faces
// +X) so a receiver can feed it straight into
// core/CompassHeading.js#resolveCompassLabel() with no unit translation
// — but note carefully what does NOT happen here: this milestone does
// NOT broadcast a `compassHeading` LABEL, and does not change
// WorldNavigationSession#getCompassHeading()'s own local-only "N"/"NE"/…
// computation for the viewer's OWN camera one bit. See
// docs/Principles.md, "A Compass Heading Is Computed From Camera
// Orientation, Never Stored Or Broadcast" (0.2.94) and its 0.3.0
// amendment: that principle was, and remains, about the LABEL — no
// `compassHeading` field has ever existed in a Document, a
// WorldPlacement, or (still true today) in this advertisement. What
// travels here is raw orientation data describing where a REMOTE
// replica's own camera is pointed, the exact same category of ephemeral
// fact `position` already is — a receiver computes ITS OWN label from
// it locally, on receipt, through the identical pure function, never a
// wire-transmitted string.
//
// `selection` is `null` or a validated core/WorldSpatialSelection.js
// payload (`toJSON()`'s own shape) — never a full SpatialSelectionState.
//
// `activity` is `null` or one of core/WorldSpatialActivity.js's closed
// vocabulary — a purely cosmetic hint, never authorization; see that
// file's own header.
export const WORLD_SPATIAL_PRESENCE_FORMAT_VERSION = 1;

export function toWorldSpatialPresenceAdvertisement({
    worldDocumentId,
    present,
    sequence,
    position = null,
    heading = null,
    selection = null,
    activity = null,
    advertisedAt = new Date().toISOString()
}) {
    return {
        formatVersion: WORLD_SPATIAL_PRESENCE_FORMAT_VERSION,
        worldDocumentId,
        present: Boolean(present),
        sequence,
        position: present && position ? { x: position.x, z: position.z } : null,
        heading: present && Number.isFinite(heading) ? heading : null,
        selection: present ? (selection || null) : null,
        activity: present ? (activity || null) : null,
        advertisedAt
    };
}

export function isValidWorldSpatialPresenceAdvertisement(value) {
    if (!value
        || typeof value !== 'object'
        || value.formatVersion !== WORLD_SPATIAL_PRESENCE_FORMAT_VERSION
        || typeof value.worldDocumentId !== 'string' || value.worldDocumentId.length === 0
        || typeof value.present !== 'boolean'
        || !Number.isFinite(value.sequence)) {
        return false;
    }
    if (!value.present) {
        return true; // a LEAVE never needs a valid position/heading/selection/activity
    }
    if (value.position !== null && (typeof value.position !== 'object' || !Number.isFinite(value.position.x) || !Number.isFinite(value.position.z))) {
        return false;
    }
    if (value.heading !== null && !Number.isFinite(value.heading)) {
        return false;
    }
    if (!isValidWorldSpatialSelectionPayload(value.selection)) {
        return false;
    }
    if (value.activity !== null && !isValidWorldSpatialActivity(value.activity)) {
        return false;
    }
    return true;
}
