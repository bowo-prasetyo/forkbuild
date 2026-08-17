// 0.2.41 — resolves and applies REMOTE avatar appearance, the
// counterpart to application/RemoteAvatarRegistry.js's own presence/
// pose handling — see docs/Principles.md, "Appearance And Position
// Are Different Lifecycles, Never One Message": two genuinely
// independent inputs the renderer only ever COMBINES, exactly the
// same split the LOCAL avatar already draws between
// AvatarProfileUseCase (what) and AvatarPresenceSession (where).
// RemoteAvatarRegistry stays entirely unaware this class exists beyond
// the one `resolveAndTrack()` call it makes when a brand-new remote
// avatar's visual is first created.
//
// `resolveAndTrack(avatarId)` is deliberately the ONE method both call
// sites (avatar creation, and this class's own per-frame sync() below)
// share, so a resolved appearance is only ever "applied and
// remembered as applied" in one place — never two independently-
// maintained bookkeeping paths that could drift apart.
export class RemoteAvatarAppearanceRegistry {
    constructor(renderFacade, avatarProfileSyncService, avatarTemplateRegistry, { defaultTemplate = null, defaultAppearance = null } = {}) {
        this._renderFacade = renderFacade;
        this._profileSyncService = avatarProfileSyncService;
        this._templateRegistry = avatarTemplateRegistry;
        this._defaultTemplate = defaultTemplate;
        this._defaultAppearance = defaultAppearance;
        this._appliedRevision = new Map(); // avatarId -> profileRevision last applied to the render facade
    }

    // Resolves avatarId's CURRENT best-known appearance without
    // applying it anywhere or recording anything — a pure read, used
    // by tests and by resolveAndTrack() below. Degrades gracefully at
    // every step: no known profile, or a templateId this replica has
    // never heard of, both resolve to the same generic placeholder —
    // see docs/Principles.md, "Validate Strictly On Write; Degrade
    // Gracefully On Read," applied here to a TEMPLATE this replica
    // simply doesn't recognize rather than to a malformed field.
    resolve(avatarId) {
        const profile = this._profileSyncService ? this._profileSyncService.getKnownProfile(avatarId) : null;
        if (!profile) {
            return { template: this._defaultTemplate, appearance: this._defaultAppearance, isPlaceholder: true, profileRevision: null };
        }
        const template = this._templateRegistry ? this._templateRegistry.get(profile.templateId) : null;
        if (!template) {
            return { template: this._defaultTemplate, appearance: this._defaultAppearance, isPlaceholder: true, profileRevision: profile.profileRevision };
        }
        return {
            template,
            appearance: template.resolveEffectiveAppearance(profile.appearance),
            isPlaceholder: false,
            profileRevision: profile.profileRevision
        };
    }

    // Resolves AND records the resolution as "applied" — used at the
    // moment a remote avatar's visual is first created (so a profile
    // that arrived BEFORE presence is never wasted on a placeholder
    // that then never gets corrected) and by sync() below.
    resolveAndTrack(avatarId) {
        const resolved = this.resolve(avatarId);
        if (resolved.profileRevision !== null) {
            this._appliedRevision.set(avatarId, resolved.profileRevision);
        }
        return resolved;
    }

    // Called once per frame — cheap: only pushes an update for a
    // KNOWN remote avatar (see RemoteAvatarRegistry.knownAvatarIds())
    // whose profile actually changed since it was last applied. Never
    // creates a remote avatar on its own — appearance with nowhere to
    // render is simply remembered by resolve() for later.
    sync(knownAvatarIds) {
        if (!this._profileSyncService) {
            return;
        }
        for (const avatarId of knownAvatarIds) {
            const profile = this._profileSyncService.getKnownProfile(avatarId);
            if (!profile) {
                continue;
            }
            if (this._appliedRevision.get(avatarId) === profile.profileRevision) {
                continue;
            }
            const resolved = this.resolveAndTrack(avatarId);
            this._renderFacade.updateRemoteAvatarAppearance(avatarId, resolved.template, resolved.appearance);
        }
    }

    // Forgets an avatarId's applied-revision bookkeeping — called the
    // moment RemoteAvatarRegistry actually removes a remote avatar
    // (its presence expired), so this map stays bounded by "currently
    // known remote avatars," never growing across a long session.
    forget(avatarId) {
        this._appliedRevision.delete(avatarId);
    }

    clear() {
        this._appliedRevision.clear();
    }
}
