import { ref, watch } from 'vue';
import { PresenceVisibility } from '../../core/PresenceVisibility.js';

// One visibility-policy form: a Public → Hidden select, an optional
// allow-list for Friends, and its own Save action. Used twice by
// ui/views/AvatarSettingsView.js — once over PresenceVisibilityUseCase,
// once over AvatarProfileVisibilityUseCase. Sharing the FORM never
// shares the POLICY: each instance reads and writes only the use case it
// is given, so saving one never saves the other — see docs/Principles.md,
// "Profile Visibility Is Never Presence Visibility."
//
// The allow-list is plain text, one identity per line (commas also
// accepted for convenience). Blank lines/whitespace are dropped by the
// policy itself, never here — this form stays as dumb about validation
// as the appearance form beside it.
export default {
    name: 'VisibilityPolicyForm',
    props: {
        // Anything with getPolicy()/updatePolicy({ visibility,
        // authorizedPeerIdentities }). The host builds a fresh one per
        // logged-in user, so a new instance means reload.
        useCase: { type: Object, required: true },
        title: { type: String, required: true },
        description: { type: String, required: true },
        publicLabel: { type: String, required: true },
        hiddenLabel: { type: String, required: true },
        saveLabel: { type: String, required: true }
    },
    setup(props) {
        const visibility = ref(PresenceVisibility.PUBLIC);
        const authorizedPeerIdentitiesText = ref('');
        const saveError = ref(null);
        const saveStatus = ref('idle'); // 'idle' | 'saving' | 'saved'

        function load() {
            const policy = props.useCase.getPolicy();
            visibility.value = policy.visibility;
            authorizedPeerIdentitiesText.value = policy.authorizedPeerIdentities.join('\n');
            saveError.value = null;
            saveStatus.value = 'idle';
        }
        watch(() => props.useCase, load, { immediate: true });

        // "Saved." describes the form as last saved — drop it as soon as
        // the form no longer matches that.
        watch([visibility, authorizedPeerIdentitiesText], () => {
            if (saveStatus.value === 'saved') {
                saveStatus.value = 'idle';
            }
        });

        function save() {
            saveError.value = null;
            saveStatus.value = 'saving';
            try {
                props.useCase.updatePolicy({
                    visibility: visibility.value,
                    authorizedPeerIdentities: authorizedPeerIdentitiesText.value.split(/[\n,]+/)
                });
                saveStatus.value = 'saved';
            } catch (error) {
                saveStatus.value = 'idle';
                saveError.value = error.message;
            }
        }

        return {
            PresenceVisibility,
            visibility,
            authorizedPeerIdentitiesText,
            saveError,
            saveStatus,
            save
        };
    },
    template: `
        <div class="avatar-settings-form avatar-settings-visibility">
            <h2>{{ title }}</h2>
            <p class="form-hint form-hint--neutral">{{ description }}</p>

            <label class="form-field">
                <span class="form-label">Visibility</span>
                <select v-model="visibility" class="form-select">
                    <option :value="PresenceVisibility.PUBLIC">{{ publicLabel }}</option>
                    <option :value="PresenceVisibility.FRIENDS">Friends — your mutual friends, plus any identities you authorize below</option>
                    <option :value="PresenceVisibility.LOCAL">Local — this session's transport scope only</option>
                    <option :value="PresenceVisibility.HIDDEN">{{ hiddenLabel }}</option>
                </select>
            </label>

            <label class="form-field" v-if="visibility === PresenceVisibility.FRIENDS">
                <span class="form-label">Additional authorized identities</span>
                <textarea
                    v-model="authorizedPeerIdentitiesText"
                    class="form-input avatar-visibility-peers"
                    rows="3"
                    placeholder="One identity per line"
                ></textarea>
                <span class="form-hint form-hint--neutral">
                    Optional. A manually-typed allow-list, on top of your real friends — for someone you trust without a mutual friend request. With no mutual friends AND nothing listed here, Friends currently behaves like Hidden.
                </span>
            </label>

            <p v-if="saveError" class="form-hint">{{ saveError }}</p>
            <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>

            <button class="action-btn action-btn--primary" @click="save" :disabled="saveStatus === 'saving'">{{ saveLabel }}</button>
        </div>
    `
};
