import { computed, inject, onBeforeUnmount, ref } from 'vue';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';

// Where My Builds opens: your own builder page (ui/views/BuilderView.js),
// the builds the name in use signed, read again when that name changes.
// Null with no name, which has no builds to show.
export function useMyBuildsRoute() {
    const identityUseCase = inject('identityUseCase', null);
    const signingIdentityId = () => (identityUseCase ? resolveSigningIdentityId(identityUseCase.provider) : null);
    const identityId = ref(signingIdentityId());
    const unwatch = identityUseCase && typeof identityUseCase.onSessionChanged === 'function'
        ? identityUseCase.onSessionChanged(() => { identityId.value = signingIdentityId(); })
        : null;
    onBeforeUnmount(() => { if (typeof unwatch === 'function') unwatch(); });
    return computed(() => (identityId.value ? `/builder/${encodeURIComponent(identityId.value)}` : null));
}
