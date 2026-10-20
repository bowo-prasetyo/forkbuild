import { UserFacingError } from '../core/app/UserFacingError.js';
import { message } from '../core/app/Message.js';
import { resolveSigningIdentityId } from './resolveSigningIdentityId.js';

// Why the current identity can or can't sign right now. resolveSigningIdentityId()
// collapses every refusal into null; telling a person "choose a name" when
// they have one and its key is only locked sends them the wrong way.
export const SigningReadiness = Object.freeze({
    READY: 'ready',
    NO_NAME: 'noName',
    LOCKED: 'locked',
    REVOKED: 'revoked'
});

// What the person can do about each refusal, for a UI that offers it as a button.
export const SigningRemedy = Object.freeze({
    CHOOSE_NAME: 'chooseName',
    UNLOCK: 'unlock',
    SWITCH_NAME: 'switchName'
});

const REMEDIES = Object.freeze({
    [SigningReadiness.NO_NAME]: SigningRemedy.CHOOSE_NAME,
    [SigningReadiness.LOCKED]: SigningRemedy.UNLOCK,
    [SigningReadiness.REVOKED]: SigningRemedy.SWITCH_NAME
});

// { status, identityId, name }. identityId is the name in use even while it
// can't sign (locked or revoked), so a reader can still show what is its own:
// reading needs no signature. It is null only with no name.
export function signingReadiness(identityProvider) {
    const signingId = resolveSigningIdentityId(identityProvider);
    const identity = sessionIdentity(identityProvider);
    if (signingId) {
        return Object.freeze({ status: SigningReadiness.READY, identityId: signingId, name: identity ? identity.label : null });
    }
    if (!identity) {
        return Object.freeze({ status: SigningReadiness.NO_NAME, identityId: null, name: null });
    }
    const status = identity.isRevoked ? SigningReadiness.REVOKED : SigningReadiness.LOCKED;
    return Object.freeze({ status, identityId: identity.identityId, name: identity.label });
}

// The identity in use, whether or not it can sign: for reading what is one's own.
export function currentIdentityId(identityProvider) {
    return signingReadiness(identityProvider).identityId;
}

export function signingRemedy(readiness) {
    return REMEDIES[readiness && readiness.status] || null;
}

// The signing identityId, or a refusal for an action that needs one.
// noNameMessage says what choosing a name is for; a locked or revoked name
// gets its own message instead, naming the name.
export function requireSigningIdentityId(identityProvider, noNameMessage, options) {
    const readiness = signingReadiness(identityProvider);
    if (readiness.status === SigningReadiness.READY) {
        return readiness.identityId;
    }
    throw refusalFor(readiness, noNameMessage, options && options.detail ? options.detail : '');
}

export function refusalFor(readiness, noNameMessage, detail = '') {
    const text = readinessMessage(readiness, noNameMessage);
    return new UserFacingError(text, { detail: detail || readiness.status, remedy: signingRemedy(readiness) });
}

export function readinessMessage(readiness, noNameMessage) {
    if (readiness.status === SigningReadiness.LOCKED) {
        return message('refusal.nameLocked', { name: readiness.name });
    }
    if (readiness.status === SigningReadiness.REVOKED) {
        return message('refusal.nameRevoked', { name: readiness.name });
    }
    return noNameMessage;
}

function sessionIdentity(identityProvider) {
    if (!identityProvider || typeof identityProvider.currentSession !== 'function'
        || typeof identityProvider.getLocalIdentity !== 'function') {
        return null;
    }
    try {
        const session = identityProvider.currentSession();
        if (!session || !session.isAuthenticated) {
            return null;
        }
        return identityProvider.getLocalIdentity(session.identityId) || null;
    } catch {
        return null;
    }
}
