// Saying something aloud in World View (core/avatar/AvatarSay.js): your line
// in a bubble over your avatar and in the short log, sent on
// `forkbuild:avatar-say` to whoever may see your avatar; theirs, once its
// trust boundary accepts them, over theirs. Events, never stored: the log
// keeps the last few lines for a minute, on this page only.
import { AvatarSaySyncService } from '../avatar/AvatarSaySyncService.js';
import { AvatarSayTrustBoundary } from '../avatar/AvatarSayTrustBoundary.js';
import { signAvatarSayAdvertisement } from '../avatar/AvatarSaySigning.js';
import {
    SAY_LOG_LIMIT, SAY_LOG_SECONDS, canSayAgain, normalizeSayText, sayBubbleSecondsFor, toAvatarSayAdvertisement
} from '../../core/avatar/AvatarSay.js';

// Why a line wasn't said: nothing to say, no avatar, a guest (no one sees a
// nameless avatar, application/avatar/GuestAvatar.js), or too soon after the last.
export const SayRefusal = Object.freeze({
    EMPTY: 'empty',
    NO_AVATAR: 'no-avatar',
    GUEST: 'guest',
    TOO_SOON: 'too-soon'
});

export const avatarSayMethods = {
    // Called from _setupRemoteAvatars(), once presence exists.
    _setupAvatarSay(localAvatarId, isBlocked) {
        if (!this._avatarSayBroadcastProvider) {
            return;
        }
        this._avatarSaySyncService = new AvatarSaySyncService(this._avatarSayBroadcastProvider, {
            localAvatarId,
            trustBoundary: new AvatarSayTrustBoundary({ isBlocked })
        });
    },

    // Once a frame: shows each line accepted since the last frame over its
    // speaker and in the log. A line from an avatar not present here is let go,
    // as a gesture is.
    _pullAvatarSay(now = Date.now()) {
        if (!this._avatarSaySyncService) {
            return;
        }
        for (const event of this._avatarSaySyncService.pull()) {
            if (!this._remoteAvatarRegistry || !this._remoteAvatarRegistry.has(event.avatarId)) {
                continue;
            }
            this._showSaid({ sayId: event.sayId, avatarId: event.avatarId, own: false, heard: true, text: event.text }, now);
        }
    },

    // Says `text` aloud. Returns { said, heard, refusal }: `said` when it shows
    // over your avatar, `heard` when it was also sent (your avatar's presence
    // may be seen; hidden, only you see it), `refusal` (a SayRefusal) when not said.
    sayAloud(text, now = Date.now()) {
        const line = normalizeSayText(text);
        if (!line) {
            return { said: false, heard: false, refusal: SayRefusal.EMPTY };
        }
        if (!this._avatarPresenceSession) {
            return { said: false, heard: false, refusal: SayRefusal.NO_AVATAR };
        }
        if (this.isLocalAvatarGuest()) {
            return { said: false, heard: false, refusal: SayRefusal.GUEST };
        }
        if (!canSayAgain(this._lastSaidAt, now)) {
            return { said: false, heard: false, refusal: SayRefusal.TOO_SOON };
        }
        this._lastSaidAt = now;
        // Time-based, so a reloaded page's lines are still newer than its last ones.
        this._saySequence = Math.max(this._saySequence + 1, now);
        const current = this._avatarPresenceSession.current;
        const advertisement = toAvatarSayAdvertisement({
            avatarId: current.avatarId,
            ownerIdentity: current.ownerIdentity,
            text: line,
            sequence: this._saySequence,
            timestamp: now
        });
        const heard = Boolean(this._avatarSaySyncService) && (this._presenceVisibilityUseCase
            ? this._presenceVisibilityUseCase.getPolicy().shouldAdvertise(this._hasFriendContext())
            : true);
        if (heard) {
            this._avatarSaySyncService.publish(signAvatarSayAdvertisement(advertisement, this._identityProvider));
        }
        this._showSaid({ sayId: advertisement.sayId, avatarId: current.avatarId, own: true, heard, text: line }, now);
        return { said: true, heard, refusal: null };
    },

    // The last few lines said here, oldest first: { sayId, own, heard, name, text, at }.
    sayLog(now = Date.now()) {
        const since = now - SAY_LOG_SECONDS * 1000;
        return this._sayLog.filter((entry) => entry.at >= since);
    },

    // Calls `callback` whenever a line joins the log; returns an unsubscribe.
    onSayLogChanged(callback) {
        this._sayLogListeners.add(callback);
        return () => this._sayLogListeners.delete(callback);
    },

    _showSaid({ sayId, avatarId, own, heard, text }, now) {
        if (this._session && typeof this._session.showAvatarSpeech === 'function') {
            this._session.showAvatarSpeech(own ? null : avatarId, text, sayBubbleSecondsFor(text));
        }
        const name = own ? null : this.getAvatarDisplayName(avatarId);
        this._sayLog = [...this._sayLog, Object.freeze({ sayId, own, heard, name, text, at: now })].slice(-SAY_LOG_LIMIT);
        for (const listener of [...this._sayLogListeners]) listener();
    }
};
