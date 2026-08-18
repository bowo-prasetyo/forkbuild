// Is THIS client currently unlocked to act as some LocalIdentity? New in
// 0.2.46, deliberately separate from LocalIdentity itself:
//
//   LocalIdentity          "Which keys does this device hold?" — durable,
//                          survives logout, survives the app closing.
//   AuthenticationSession  "Is one of them in use right now?" — transient,
//                          answers exactly the questions the app needs
//                          answered consistently everywhere: is anyone
//                          logged in, who, and can they sign.
//
// There is no server here to issue this session — it is the local
// client's own record that it currently holds the private key half of
// `identityId` and is therefore willing to sign on that identity's
// behalf. "Login" for a decentralized identity means unlocking a key
// the device already has, never a round trip that asks a server to
// vouch for a person.
export const AuthenticationState = Object.freeze({
    ANONYMOUS: 'ANONYMOUS',
    AUTHENTICATED: 'AUTHENTICATED'
});

export class AuthenticationSession {
    constructor({ identityId = null, authenticatedAt = null, state = AuthenticationState.ANONYMOUS } = {}) {
        if (state === AuthenticationState.AUTHENTICATED && !identityId) {
            throw new Error('AuthenticationSession: an AUTHENTICATED session requires an identityId');
        }
        this._identityId = state === AuthenticationState.AUTHENTICATED ? identityId : null;
        this._authenticatedAt = state === AuthenticationState.AUTHENTICATED && authenticatedAt
            ? new Date(authenticatedAt)
            : null;
        this._state = state;
    }

    get identityId() { return this._identityId; }
    get authenticatedAt() { return this._authenticatedAt; }
    get state() { return this._state; }
    get isAuthenticated() { return this._state === AuthenticationState.AUTHENTICATED; }

    toJSON() {
        return {
            identityId: this._identityId,
            authenticatedAt: this._authenticatedAt ? this._authenticatedAt.toISOString() : null,
            state: this._state
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return AuthenticationSession.anonymous();
        }
        return new AuthenticationSession(json);
    }

    static anonymous() {
        return new AuthenticationSession({ state: AuthenticationState.ANONYMOUS });
    }

    static authenticated(identityId, authenticatedAt = new Date()) {
        return new AuthenticationSession({ identityId, authenticatedAt, state: AuthenticationState.AUTHENTICATED });
    }
}
