import { MIN_PASSPHRASE_LENGTH } from '../../identity/LocalIdentityProvider.js';
import { message } from '../../core/Message.js';

// Whether a "new passphrase" form (creating or protecting an identity) can
// be submitted, and what to tell the user if not. A passphrase is the
// default: leaving it blank is only accepted once the user has explicitly
// chosen an unprotected identity (allowUnprotected), since the key is then
// stored in plain form on this device.
//
// Returns { ok, protect, message }: protect says whether to encrypt the
// key; message is the hint to show (core/Message.js), or null.
export function evaluateNewPassphrase({ passphrase = '', confirmation = '', allowUnprotected = false, offerUnprotected = true } = {}) {
    if (!passphrase) {
        if (offerUnprotected && allowUnprotected) {
            return { ok: true, protect: false, message: null };
        }
        return {
            ok: false,
            protect: false,
            message: message(offerUnprotected ? 'passphrase.chooseOrSkip' : 'passphrase.choose')
        };
    }
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        return { ok: false, protect: true, message: message('passphrase.tooShort', { count: MIN_PASSPHRASE_LENGTH }) };
    }
    if (confirmation !== passphrase) {
        return { ok: false, protect: true, message: message('passphrase.mismatch') };
    }
    return { ok: true, protect: true, message: null };
}

export { MIN_PASSPHRASE_LENGTH };
