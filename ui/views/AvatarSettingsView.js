import { ref, reactive, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { CreateAvatarProfileUseCase } from '../../application/avatar/CreateAvatarProfileUseCase.js';
import { CreatePresenceVisibilityUseCase } from '../../application/presence/CreatePresenceVisibilityUseCase.js';
import { CreateAvatarProfileVisibilityUseCase } from '../../application/avatar/CreateAvatarProfileVisibilityUseCase.js';
import { sortOptionsByLabel, sortLabels } from '../../utils/sortOptionsByLabel.js';
import VisibilityPolicyForm from '../components/VisibilityPolicyForm.js';

// 0.2.34 — the first VISIBLE avatar feature: an editor over the
// persistent AvatarProfile core/application built in 0.2.33/0.2.34.
// Deliberately no 3D preview and no World View integration yet (that
// is 0.2.35) — "a lightweight template representation is enough" per
// the design doc. The preview below is a flat, deterministic SVG
// built ONLY from already-validated appearance fields; it exists to
// give immediate visual feedback while editing, not to predict what
// the eventual Three.js avatar will look like.
//
// Every control here is populated FROM the current AvatarTemplate's
// own declared components/options — never a hardcoded list — so a
// second registered template (see core/library/CoreAvatarTemplateLibrary.js)
// genuinely changes what this form offers, proving the "host resolves,
// component renders" / "declarative data drives the UI" property
// rather than just asserting it.
//
// Skin tone -> swatch color is a PRESENTATION-ONLY lookup local to
// this view. It is not part of the appearance schema (a skin option
// is validated as an opaque id, like "skin-03" — see
// core/AvatarAppearanceValidator.js) and never leaves this file.
const SKIN_TONE_SWATCHES = {
    'skin-01': '#ffe0bd',
    'skin-02': '#f1c27d',
    'skin-03': '#e0ac69',
    'skin-04': '#c68642',
    'skin-05': '#8d5524',
    'skin-06': '#4a2c17'
};

function skinSwatch(skinOptionId) {
    return SKIN_TONE_SWATCHES[skinOptionId] || SKIN_TONE_SWATCHES['skin-03'];
}

export default {
    name: 'AvatarSettingsView',
    components: { VisibilityPolicyForm },
    setup() {
        const identityUseCase = inject('identityUseCase');
        const user = ref(identityUseCase.currentUser());

        const avatarProfileUseCase = ref(null);
        const templates = ref([]);
        const loaded = ref(false);
        const saveError = ref(null);
        const saveStatus = ref('idle'); // 'idle' | 'saving' | 'saved'

        const selectedTemplateId = ref(null);
        const appearance = reactive({});
        const displayName = ref('');

        // 0.2.40 / 0.2.58 — each drives its own VisibilityPolicyForm,
        // independent of the appearance form above and of each other:
        // separate use cases, separate storage keys (presence-visibility:
        // vs profile-visibility:), so saving one never saves another —
        // see docs/Principles.md, "Profile Visibility Is Never Presence
        // Visibility."
        const presenceVisibilityUseCase = ref(null);
        const avatarProfileVisibilityUseCase = ref(null);

        const selectedTemplate = computed(() =>
            templates.value.find((t) => t.templateId === selectedTemplateId.value) || null
        );

        // A component's choices, alphabetically (numeric-aware, so
        // "hair-10" follows "hair-09") — display order only; the template
        // itself and its defaults are untouched.
        function componentOptions(name) {
            return sortLabels(selectedTemplate.value.getComponent(name).options);
        }

        function applyAppearance(source) {
            for (const key of Object.keys(appearance)) {
                delete appearance[key];
            }
            Object.assign(appearance, source);
        }

        function loadForCurrentUser() {
            if (!user.value) {
                loaded.value = false;
                return;
            }
            const wired = new CreateAvatarProfileUseCase().execute(identityUseCase.provider);
            avatarProfileUseCase.value = wired.avatarProfileUseCase;
            templates.value = sortOptionsByLabel(wired.templateRegistry.getAll(), (t) => t.displayLabel);

            const { profile, template, appearance: effectiveAppearance } = avatarProfileUseCase.value.getEffectiveAvatar();
            selectedTemplateId.value = template ? template.templateId : null;
            applyAppearance(effectiveAppearance);
            displayName.value = profile.displayName;

            presenceVisibilityUseCase.value = new CreatePresenceVisibilityUseCase()
                .execute(identityUseCase.provider).presenceVisibilityUseCase;
            avatarProfileVisibilityUseCase.value = new CreateAvatarProfileVisibilityUseCase()
                .execute(identityUseCase.provider).avatarProfileVisibilityUseCase;

            loaded.value = true;
        }

        // Switching templates resets to the NEW template's defaults —
        // mirrors AvatarProfileUseCase.updateProfile's own behavior
        // (see its comment): an old template's option ids are not
        // guaranteed to exist on the new one.
        function onTemplateChange() {
            if (selectedTemplate.value) {
                applyAppearance(selectedTemplate.value.defaultAppearance);
            }
        }

        // For a `multiple` component (accessories in the core library),
        // whose appearance value is an array of option ids.
        function isOptionSelected(componentName, optionId) {
            const current = appearance[componentName];
            return Array.isArray(current) && current.includes(optionId);
        }

        function toggleOption(componentName, optionId) {
            const current = Array.isArray(appearance[componentName]) ? appearance[componentName] : [];
            appearance[componentName] = current.includes(optionId)
                ? current.filter((id) => id !== optionId)
                : [...current, optionId];
        }

        function save() {
            saveError.value = null;
            saveStatus.value = 'saving';
            try {
                avatarProfileUseCase.value.updateProfile({
                    templateId: selectedTemplateId.value,
                    appearance: { ...appearance },
                    displayName: displayName.value
                });
                saveStatus.value = 'saved';
            } catch (error) {
                saveStatus.value = 'idle';
                saveError.value = error.message;
            }
        }

        let unsubscribeUser = null;
        onMounted(() => {
            unsubscribeUser = identityUseCase.onUserChanged((u) => {
                user.value = u;
                loadForCurrentUser();
            });
            loadForCurrentUser();
        });
        onBeforeUnmount(() => {
            if (unsubscribeUser) {
                unsubscribeUser();
            }
        });

        return {
            user,
            templates,
            loaded,
            saveError,
            saveStatus,
            selectedTemplateId,
            selectedTemplate,
            componentOptions,
            appearance,
            displayName,
            onTemplateChange,
            isOptionSelected,
            toggleOption,
            save,
            skinSwatch,
            presenceVisibilityUseCase,
            avatarProfileVisibilityUseCase
        };
    },
    template: `
        <section class="avatar-settings-view">
            <h1>My Avatar</h1>

            <p v-if="!user" class="form-hint form-hint--neutral">
                Log in to create and customize your avatar.
            </p>

            <div v-else-if="loaded && selectedTemplate" class="avatar-settings-layout">
                <div class="avatar-preview-panel">
                    <svg viewBox="0 0 100 140" class="avatar-preview-figure" role="img" aria-label="Avatar preview">
                        <rect x="30" y="70" width="40" height="45" rx="6" :fill="appearance.pantsColor" />
                        <rect x="25" y="40" width="50" height="38" rx="8" :fill="appearance.shirtColor" />
                        <circle cx="50" cy="24" r="20" :fill="skinSwatch(appearance.skin)" />
                        <path d="M 30 20 Q 50 0 70 20 L 70 12 Q 50 -4 30 12 Z" :fill="appearance.hairColor" />
                        <text x="50" y="130" text-anchor="middle" class="avatar-preview-label">{{ displayName || user.displayName }}</text>
                    </svg>
                    <p class="avatar-preview-accessories" v-if="(appearance.accessories || []).length">
                        {{ appearance.accessories.join(', ') }}
                    </p>
                </div>

                <div class="avatar-settings-form">
                    <label class="form-field">
                        <span class="form-label">Template</span>
                        <select v-model="selectedTemplateId" @change="onTemplateChange" class="form-select">
                            <option v-for="t in templates" :key="t.templateId" :value="t.templateId">{{ t.displayLabel }}</option>
                        </select>
                    </label>

                    <template v-for="name in selectedTemplate.componentNames" :key="name">
                        <div v-if="selectedTemplate.getComponent(name).multiple" class="form-field avatar-component-field">
                            <span class="form-label">{{ name }}</span>
                            <span class="avatar-component-controls">
                                <span class="avatar-accessory-list">
                                    <label v-for="opt in componentOptions(name)" :key="opt" class="avatar-accessory-option">
                                        <input
                                            type="checkbox"
                                            :checked="isOptionSelected(name, opt)"
                                            @change="toggleOption(name, opt)"
                                        />
                                        {{ opt }}
                                    </label>
                                </span>
                                <input
                                    v-if="selectedTemplate.getComponent(name).hasColor"
                                    type="color"
                                    v-model="appearance[name + 'Color']"
                                    class="avatar-color-swatch"
                                    :aria-label="name + ' color'"
                                />
                            </span>
                        </div>
                        <label v-else class="form-field avatar-component-field">
                            <span class="form-label">{{ name }}</span>
                            <span class="avatar-component-controls">
                                <select v-model="appearance[name]" class="form-select">
                                    <option v-for="opt in componentOptions(name)" :key="opt" :value="opt">{{ opt }}</option>
                                </select>
                                <input
                                    v-if="selectedTemplate.getComponent(name).hasColor"
                                    type="color"
                                    v-model="appearance[name + 'Color']"
                                    class="avatar-color-swatch"
                                    :aria-label="name + ' color'"
                                />
                            </span>
                        </label>
                    </template>

                    <label class="form-field">
                        <span class="form-label">Display name</span>
                        <input v-model="displayName" type="text" class="form-input" maxlength="60" />
                    </label>

                    <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                    <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>

                    <button class="action-btn action-btn--primary" @click="save" :disabled="saveStatus === 'saving'">Save</button>
                </div>
            </div>

            <!-- 0.2.40: a deliberately SEPARATE form/save action from
                 appearance above — see docs/Principles.md,
                 "AvatarProfile, AvatarPresence, and
                 PresenceVisibilityPolicy Are Three Independent
                 Concerns." Never affects how the avatar looks, only
                 whether its live position is ever published at all. -->
            <VisibilityPolicyForm
                v-if="loaded"
                :use-case="presenceVisibilityUseCase"
                title="Presence Visibility"
                description="Controls who may receive your live position while you're in World View — never your avatar's appearance."
                public-label="Public — anyone connected can see you"
                hidden-label="Hidden — never advertise your presence"
                save-label="Save Visibility"
            />

            <!-- 0.2.58: a deliberately SEPARATE form/save action from
                 Presence Visibility above — see docs/Principles.md,
                 "Profile Visibility Is Never Presence Visibility."
                 Never affects whether your position is published, only
                 whether your appearance is. -->
            <VisibilityPolicyForm
                v-if="loaded"
                :use-case="avatarProfileVisibilityUseCase"
                title="Profile Visibility"
                description="Your avatar appearance may be shared independently of presence — controls who may receive your template, colors, and display name."
                public-label="Public — anyone connected can see your appearance"
                hidden-label="Hidden — never advertise your appearance"
                save-label="Save Profile Visibility"
            />

            <p v-if="loaded" class="form-hint form-hint--neutral">
                Friendship and visibility are separate. Being friends does not automatically reveal your avatar — your visibility policies above decide what is shared, and with whom. Withholding a future update is also not the same as remote deletion: a peer who already received your presence or appearance keeps whatever they last received.
            </p>
        </section>
    `
};
