import { ref, inject } from 'vue';

export default {
    name: 'LoginModal',
    emits: ['close'],
    setup(props, { emit }) {
        const identityUseCase = inject('identityUseCase');
        const username = ref('');

        function submit() {
            if (username.value.trim()) {
                identityUseCase.login(username.value.trim());
                emit('close');
            }
        }

        return { username, submit };
    },
    template: `
        <div class="modal-overlay" @click.self="$emit('close')">
            <div class="modal-content">
                <h3>Login</h3>
                <p class="modal-subtitle">Enter a username to identify your creations.</p>
                <input 
                    v-model="username" 
                    type="text" 
                    placeholder="Username" 
                    class="modal-input"
                    @keydown.enter="submit"
                />
                <div class="modal-actions">
                    <button class="modal-btn modal-btn--secondary" @click="$emit('close')">Cancel</button>
                    <button class="modal-btn modal-btn--primary" @click="submit">Login</button>
                </div>
            </div>
        </div>
    `
};
