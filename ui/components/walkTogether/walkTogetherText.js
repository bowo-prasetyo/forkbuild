import { WalkTogetherFailure } from '../../../application/walkTogether/WalkTogether.js';
import { t } from '../../i18n/i18n.js';

// Why walking together failed (application/walkTogether/WalkTogether.js,
// WalkTogetherFailure), in the player's words, for the host's dialog and a
// guest's page alike.
const FAILURE_KEYS = Object.freeze({
    [WalkTogetherFailure.UNREACHABLE]: 'walkTogether.failure.unreachable',
    [WalkTogetherFailure.NOT_SIGNED_IN]: 'walkTogether.failure.notSignedIn',
    [WalkTogetherFailure.NOT_PUBLISHED]: 'walkTogether.failure.notPublished',
    [WalkTogetherFailure.INVALID_CODE]: 'walkTogether.failure.invalidCode',
    [WalkTogetherFailure.NOT_FOUND]: 'walkTogether.failure.notFound',
    [WalkTogetherFailure.CONNECTION]: 'walkTogether.failure.connection',
    [WalkTogetherFailure.WORLD_NOT_VERIFIED]: 'walkTogether.failure.worldNotVerified'
});

export function walkTogetherFailureText(failure) {
    return t(FAILURE_KEYS[failure] || 'walkTogether.failure.connection');
}
