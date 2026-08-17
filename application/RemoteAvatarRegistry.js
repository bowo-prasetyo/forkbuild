import { RemoteAvatarInterpolator } from './RemoteAvatarInterpolator.js';

// 0.2.37 — reconciles "which remote avatars does the render facade
// currently show" against "what does PresenceSyncService currently
// know," and drives each one's visual interpolation. Two separate
// steps, called once per render frame, mirroring the same split
// AvatarVisual itself already draws between a presence-driven update
// and a time-driven tick:
//
//   sync(knownPresences, now)  — reconcile WHICH avatars exist and
//                                 retarget any whose sequence advanced;
//                                 cheap, only does real work when
//                                 something actually changed.
//   tick(now)                  — push each remote avatar's CURRENT
//                                 interpolated pose to the render
//                                 facade; runs every frame regardless,
//                                 the same way AvatarVisual.tick()
//                                 keeps a gait cycle moving between
//                                 presence updates.
//
// Appearance is deliberately NOT part of what this class manages —
// 0.2.37 does not synchronize AvatarProfile/appearance at all (see
// the design doc's own scope list), so every remote avatar renders
// with the SAME fixed placeholder template+appearance, resolved once
// by WorldNavigationSession and handed in here unchanged. Rendering
// itself reuses 0.2.35/0.2.36's AvatarRenderer/AvatarVisual
// completely unmodified — a remote avatar is, to the renderer, just
// another avatar.
export class RemoteAvatarRegistry {
    constructor(renderFacade, { defaultTemplate = null, defaultAppearance = null } = {}) {
        this._renderFacade = renderFacade;
        this._defaultTemplate = defaultTemplate;
        this._defaultAppearance = defaultAppearance;
        this._interpolators = new Map(); // avatarId -> RemoteAvatarInterpolator
    }

    sync(knownPresences, now = Date.now()) {
        const seenIds = new Set();
        for (const { advertisement } of knownPresences) {
            seenIds.add(advertisement.avatarId);
            const existing = this._interpolators.get(advertisement.avatarId);
            if (!existing) {
                const interpolator = new RemoteAvatarInterpolator(advertisement, now);
                this._interpolators.set(advertisement.avatarId, interpolator);
                if (this._defaultTemplate) {
                    this._renderFacade.setRemoteAvatar(advertisement.avatarId, this._defaultTemplate, this._defaultAppearance, advertisement);
                }
                continue;
            }
            existing.retarget(advertisement, now);
        }
        for (const avatarId of Array.from(this._interpolators.keys())) {
            if (!seenIds.has(avatarId)) {
                this._interpolators.delete(avatarId);
                this._renderFacade.removeRemoteAvatar(avatarId);
            }
        }
    }

    tick(now = Date.now()) {
        for (const [avatarId, interpolator] of this._interpolators) {
            this._renderFacade.updateRemoteAvatarPresence(avatarId, interpolator.currentPresence(now));
        }
    }

    // Debug/UI surface — how many remote avatars this replica
    // currently believes exist, independent of visibility.
    get size() {
        return this._interpolators.size;
    }

    // 0.2.39 — whether a given avatarId is currently a KNOWN remote
    // avatar (still present, per sync()'s own bookkeeping — an
    // avatarId that has aged into ABSENT and been pruned is no longer
    // known). Used by WorldNavigationSession to gracefully drop an
    // avatar-interaction target or a followed avatar the moment its
    // presence actually expires, rather than pointing at a
    // no-longer-existing remote avatar.
    has(avatarId) {
        return this._interpolators.has(avatarId);
    }

    // The SAME interpolated position tick() already pushes to the
    // render facade every frame, exposed here for
    // WorldNavigationSession's "follow this remote avatar" camera
    // relationship (0.2.39) — deliberately reads the interpolator
    // directly rather than adding a second position-tracking path;
    // following sees EXACTLY what the renderer is currently drawing,
    // never a different, more-authoritative value.
    currentPosition(avatarId, now = Date.now()) {
        const interpolator = this._interpolators.get(avatarId);
        return interpolator ? interpolator.currentPresence(now).position : null;
    }

    dispose() {
        for (const avatarId of this._interpolators.keys()) {
            this._renderFacade.removeRemoteAvatar(avatarId);
        }
        this._interpolators.clear();
    }
}
