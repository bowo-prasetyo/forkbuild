import { isValidWorldPresenceActivity } from './WorldPresenceActivity.js';

// 0.2.98 — Shared World Membership & Collaborative Presence.
//
// The wire shape of `application/WorldPresenceUseCase.js`'s own protocol
// (`forkbuild:world-presence`) — a SEPARATE protocol from
// `forkbuild:chat`, `forkbuild:device-conversation-sync`, and
// `forkbuild:world-sync`, never a new message riding any of those. See
// docs/Principles.md, "World Presence Is Computed From Live, Authorized
// Connections, Never Persisted" (0.2.98).
//
// Deliberately, permanently UNSIGNED — the same reasoning core/
// AvatarPresence.js's own header already gives for avatar movement: a
// World Presence advertisement is never meant to be believed or relied
// on beyond the single, currently-live, mutually-AUTHENTICATED
// peer/PeerConnection.js it travels over. It is never gossiped through
// an intermediary the way a core/WorldEditAuthorizationEnvelope.js grant
// is, and it is never durable — see application/WorldPresenceUseCase.js's
// own header for why identity, for THIS protocol, comes entirely from
// `meta.connectedPeer.remoteIdentity`, exactly like core/AvatarPresence.js
// already reads it from the live connection rather than from a claim on
// the wire. Adding a signature here would suggest this fact is meant to
// outlive the connection it arrived on — it is not.
//
// Fields:
//   worldDocumentId — the World this participant is currently present
//                      in. A participant present in more than one World
//                      at once (unusual, but not forbidden) sends one
//                      advertisement per World.
//   present          — true: "I am here" (an initial entry or a
//                      heartbeat/activity change); false: "I have left
//                      this World" — an explicit LEAVE, never merely
//                      inferred from silence. See
//                      application/WorldPresenceUseCase.js's own
//                      leaveWorld().
//   activity         — core/WorldPresenceActivity.js's own closed
//                      EXPLORING/EDITING vocabulary. Only meaningful
//                      when `present` is true; ignored on a LEAVE.
//   advertisedAt     — ISO timestamp, purely diagnostic (never used for
//                      freshness/replay comparison the way a signed
//                      envelope's timestamp is — there is nothing to
//                      compare against across restarts; a fresh session
//                      simply starts advertising again).
export const WORLD_PRESENCE_FORMAT_VERSION = 1;

export function toWorldPresenceAdvertisement({
    worldDocumentId,
    present,
    activity,
    advertisedAt = new Date().toISOString()
}) {
    return {
        formatVersion: WORLD_PRESENCE_FORMAT_VERSION,
        worldDocumentId,
        present: Boolean(present),
        activity: activity || null,
        advertisedAt
    };
}

export function isValidWorldPresenceAdvertisement(value) {
    if (!value
        || typeof value !== 'object'
        || value.formatVersion !== WORLD_PRESENCE_FORMAT_VERSION
        || typeof value.worldDocumentId !== 'string' || value.worldDocumentId.length === 0
        || typeof value.present !== 'boolean') {
        return false;
    }
    if (!value.present) {
        return true; // a LEAVE never needs a valid activity
    }
    return isValidWorldPresenceActivity(value.activity);
}
