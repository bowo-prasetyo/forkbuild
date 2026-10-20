import { inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { SigningReadiness, readinessMessage, signingReadiness, signingRemedy } from '../../identity/SigningReadiness.js';
import SigningRemedyButton from './SigningRemedyButton.js';
import { t } from '../i18n/i18n.js';

// In place of something that needs a signature (a comment box, say): why it
// can't be used right now and the button that fixes it. With no name it
// shows `noNameText`, which says what a name is for; a locked or revoked
// name gets its own message, so nobody is told to choose a name they have.
export default {
    name: 'NameNeededNotice',
    components: { SigningRemedyButton },
    props: {
        noNameText: { type: String, required: true }
    },
    setup(props) {
        const identityUseCase = inject('identityUseCase', null);
        const readiness = ref(read());
        const unsubscribes = [];

        function read() {
            return signingReadiness(identityUseCase ? identityUseCase.provider : null);
        }

        function refresh() {
            readiness.value = read();
        }

        onMounted(() => {
            if (!identityUseCase) return;
            unsubscribes.push(identityUseCase.onUserChanged(refresh), identityUseCase.onVaultLockChanged(refresh));
        });
        onBeforeUnmount(() => unsubscribes.forEach((unsubscribe) => unsubscribe()));

        return {
            text: () => {
                const { status } = readiness.value;
                if (status === SigningReadiness.READY) return '';
                return status === SigningReadiness.NO_NAME ? props.noNameText : t(readinessMessage(readiness.value, null));
            },
            remedy: () => signingRemedy(readiness.value)
        };
    },
    template: `
        <span class="name-needed-notice">
            <span class="name-needed-notice-text">{{ text() }}</span>
            <SigningRemedyButton :remedy="remedy()" />
        </span>
    `
};
