import { AvatarInteractionTrustBoundary } from './AvatarInteractionTrustBoundary.js';

// 0.2.45 — the "advertise / pull" round trip application/
// PresenceSyncService.js and application/AvatarProfileSyncService.js
// already established, one more layer over — but for EVENTS, not
// STATE. See docs/Principles.md, "State Synchronization And Event
// Synchronization Are Different Protocols":
//
//   Profile     -> retain latest
//   Presence    -> retain latest while fresh
//   Interaction -> don't retain
//
// This is what makes AvatarInteractionSyncService deliberately
// SIMPLER than its two siblings, in one specific way: there is no
// LocalAvatarInteractionStore, no `list()`/`get()`, and no per-avatarId
// "currently known" record anywhere in this file. pull() drains the
// inbox, judges each arrival through an AvatarInteractionTrustBoundary
// (signature verification, identity binding, replay/staleness
// rejection — see that file's own header), and returns ONLY the
// events accepted THIS call — a transient batch, never a persisted
// view a caller can ask for again later. A rejected or already-seen
// event is simply dropped; there is nothing further to remember about
// it beyond what the trust boundary's own bounded replay window
// already keeps for its next evaluation.
//
// Deliberately reuses presence/profile's own transport shape (any
// object exposing advertise()/onAdvertisement()/dispose()) rather than
// inventing a new interface — see application/CreateWorldViewUseCase.js,
// which wires this over presence/LocalAvatarPresenceBroadcastProvider.js
// on its own channel, exactly the way 0.2.41 already reused that same
// class for profile's channel instead of building a
// presence-flavored-in-name-only sibling.
//
// No periodic republish, unlike profile's PROFILE_REPUBLISH_INTERVAL_MS
// — a missed gesture is not something a later-joining replica should
// ever "catch up" on; see the design doc's own framing: "if Alice
// disappears for ten minutes and then reconnects, you want her latest
// profile and presence — not ten minutes of old waves."
export class AvatarInteractionSyncService {
    constructor(broadcastProvider = null, { localAvatarId = null, trustBoundary = new AvatarInteractionTrustBoundary() } = {}) {
        this._broadcastProvider = broadcastProvider;
        this._localAvatarId = localAvatarId;
        this._trustBoundary = trustBoundary;
        this._inbox = [];
        this._unsubscribe = broadcastProvider
            ? broadcastProvider.onAdvertisement((advertisement) => { this._inbox.push(advertisement); })
            : null;
    }

    publish(advertisement) {
        if (this._broadcastProvider) {
            this._broadcastProvider.advertise(advertisement);
        }
    }

    // Drains whatever advertisements arrived since the last pull and
    // returns only the ones the trust boundary ACCEPTED — the ONE
    // place incoming interaction data crosses from "a raw broadcast
    // event" to "this replica's own accepted event," exactly the
    // boundary PresenceSyncService.pull()/AvatarProfileSyncService.pull()
    // already draw for their own domains, minus the "then store it as
    // current" half neither applies here.
    pull() {
        const inbox = this._inbox;
        this._inbox = [];
        const accepted = [];
        for (const advertisement of inbox) {
            // A channel never delivers its own message back, but this
            // check stays as defense in depth — the same posture
            // PresenceSyncService.pull() already documents.
            if (this._localAvatarId && advertisement && advertisement.avatarId === this._localAvatarId) {
                continue;
            }
            const { accepted: ok } = this._trustBoundary.evaluate(advertisement);
            if (ok) {
                accepted.push(advertisement);
            }
        }
        return accepted;
    }

    dispose() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this._inbox = [];
    }
}
