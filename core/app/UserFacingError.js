// An error meant for the person using the app, not only for a developer: a
// refused action, an invalid input. It carries a message descriptor
// (core/app/Message.js) the UI shows in the chosen language through errorText().
// `message` stays the key plus `detail`, for logs and developer tools.
//
// Programmer errors (a missing collaborator, a broken invariant) stay plain
// Errors in English: they are never meant to be read by a person using the app.
//
// `remedy` names what the person can do about it (identity/SigningReadiness.js,
// SigningRemedy), for a UI that offers it as a button next to the message.
import { isMessage } from './Message.js';

export class UserFacingError extends Error {
    constructor(userMessage, { detail = '', cause, remedy = null } = {}) {
        if (!isMessage(userMessage)) {
            throw new Error('UserFacingError requires a message descriptor');
        }
        super(detail ? `${userMessage.key}: ${detail}` : userMessage.key, cause ? { cause } : undefined);
        this.name = 'UserFacingError';
        this.userMessage = userMessage;
        this.remedy = remedy;
    }
}

export function isUserFacingError(error) {
    return Boolean(error) && isMessage(error.userMessage);
}
