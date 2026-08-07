// Pure data: who is currently identified, and which provider vouches for
// them. displayName defaults to username when a provider doesn't
// distinguish the two (LocalIdentityProvider doesn't; a future Steem
// Keychain provider might show a profile display name instead).
export class Identity {
    constructor({ username, displayName = username, providerId }) {
        this._username = username;
        this._displayName = displayName;
        this._providerId = providerId;
    }

    get username() {
        return this._username;
    }

    get displayName() {
        return this._displayName;
    }

    get providerId() {
        return this._providerId;
    }
}
