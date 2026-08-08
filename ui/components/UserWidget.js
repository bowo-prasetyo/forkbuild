import { ref, onMounted, onBeforeUnmount, inject } from 'vue';
import LoginModal from './LoginModal.js';

export default {
    name: 'UserWidget',
    components: { LoginModal },
    setup() {
        const identityUseCase = inject('identityUseCase');
        const user = ref(identityUseCase.currentUser());
        const showModal = ref(false);
        let unsubscribe = null;

        function logout() {
            identityUseCase.logout();
        }

        onMounted(() => {
            unsubscribe = identityUseCase.onUserChanged((u) => {
                user.value = u;
            });
        });

        onBeforeUnmount(() => {
            if (unsubscribe) {
                unsubscribe();
            }
        });

        return { user, logout, showModal };
    },
    template: `
        <div class="user-widget">
            <template v-if="user">
                <span class="user-name">{{ user.displayName }}</span>
                <button class="user-btn user-btn--logout" @click="logout">Logout</button>
            </template>
            <template v-else>
                <button class="user-btn user-btn--login" @click="showModal = true">Login</button>
            </template>
            <LoginModal v-if="showModal" @close="showModal = false" />
        </div>
    `
};
