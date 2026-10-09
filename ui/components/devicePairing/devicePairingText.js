import { DevicePairingFailure } from '../../../application/devicePairing/DevicePairing.js';
import { t } from '../../i18n/i18n.js';

const FAILURE_KEYS = Object.freeze({
    [DevicePairingFailure.UNREACHABLE]: 'devicePairing.failure.unreachable',
    [DevicePairingFailure.INVALID_CODE]: 'devicePairing.failure.invalidCode',
    [DevicePairingFailure.NOT_FOUND]: 'devicePairing.failure.notFound',
    [DevicePairingFailure.CONNECTION]: 'devicePairing.failure.connection',
    [DevicePairingFailure.DAMAGED]: 'devicePairing.failure.damaged',
    [DevicePairingFailure.NOT_ADDED]: 'devicePairing.failure.notAdded'
});

// Why a pairing failed, in the person's language.
export function devicePairingFailureText(failure) {
    return t(FAILURE_KEYS[failure] || FAILURE_KEYS[DevicePairingFailure.CONNECTION]);
}
