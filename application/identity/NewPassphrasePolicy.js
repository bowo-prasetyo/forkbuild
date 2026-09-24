import { MIN_PASSPHRASE_LENGTH } from '../../identity/LocalIdentityProvider.js';

// Whether a "new passphrase" form (creating or protecting an identity) can
// be submitted, and what to tell the user if not. A passphrase is the
// default: leaving it blank is only accepted once the user has explicitly
// chosen an unprotected identity (allowUnprotected), since the key is then
// stored in plain form on this device.
//
// Returns { ok, protect, message }: protect says whether to encrypt the
// key; message is the hint to show, or null.
export function evaluateNewPassphrase({ passphrase = '', confirmation = '', allowUnprotected = false, offerUnprotected = true } = {}) {
    if (!passphrase) {
        if (offerUnprotected && allowUnprotected) {
            return { ok: true, protect: false, message: null };
        }
        return {
            ok: false,
            protect: false,
            message: offerUnprotected
                ? 'Choose a passphrase, or tick "Create without a passphrase".'
                : 'Choose a passphrase.'
        };
    }
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        return { ok: false, protect: true, message: `A passphrase needs at least ${MIN_PASSPHRASE_LENGTH} characters.` };
    }
    if (confirmation !== passphrase) {
        return { ok: false, protect: true, message: 'The two passphrases don\'t match.' };
    }
    return { ok: true, protect: true, message: null };
}

export { MIN_PASSPHRASE_LENGTH };
