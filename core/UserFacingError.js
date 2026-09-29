// An error meant for the person using the app, not only for a developer: a
// refused action, an invalid input. It carries a message descriptor
// (core/Message.js) the UI shows in the chosen language through errorText().
// `message` stays the key plus `detail`, for logs and developer tools.
//
// Programmer errors (a missing collaborator, a broken invariant) stay plain
// Errors in English: they are never meant to be read by a person using the app.
import { isMessage } from './Message.js';

export class UserFacingError extends Error {
    constructor(userMessage, { detail = '', cause } = {}) {
        if (!isMessage(userMessage)) {
            throw new Error('UserFacingError requires a message descriptor');
        }
        super(detail ? `${userMessage.key}: ${detail}` : userMessage.key, cause ? { cause } : undefined);
        this.name = 'UserFacingError';
        this.userMessage = userMessage;
    }
}

export function isUserFacingError(error) {
    return Boolean(error) && isMessage(error.userMessage);
}
