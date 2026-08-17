import { ref, reactive, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { CreateAvatarProfileUseCase } from '../../application/CreateAvatarProfileUseCase.js';

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
const DEFAULT_SKIN_SWATCH = '#e0ac69';

function skinSwatch(skinOptionId) {
    return SKIN_TONE_SWATCHES[skinOptionId] || DEFAULT_SKIN_SWATCH;
}

export default {
    name: 'AvatarSettingsView',
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

        const selectedTemplate = computed(() =>
            templates.value.find((t) => t.templateId === selectedTemplateId.value) || null
        );

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
            templates.value = wired.templateRegistry.getAll();

            const { profile, template, appearance: effectiveAppearance } = avatarProfileUseCase.value.getEffectiveAvatar();
            selectedTemplateId.value = template ? template.templateId : null;
            applyAppearance(effectiveAppearance);
            displayName.value = profile.displayName;
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

        function isAccessorySelected(componentName, optionId) {
            const current = appearance[componentName];
            return Array.isArray(current) && current.includes(optionId);
        }

        function toggleAccessory(componentName, optionId) {
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
            appearance,
            displayName,
            onTemplateChange,
            isAccessorySelected,
            toggleAccessory,
            save,
            skinSwatch
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
                        <rect x="30" y="70" width="40" height="45" rx="6"
                              :fill="appearance.pantsColor || '#222222'" />
                        <rect x="25" y="40" width="50" height="38" rx="8"
                              :fill="appearance.shirtColor || '#3366cc'" />
                        <circle cx="50" cy="24" r="20" :fill="skinSwatch(appearance.skin)" />
                        <path d="M 30 20 Q 50 0 70 20 L 70 12 Q 50 -4 30 12 Z"
                              :fill="appearance.hairColor || '#3b2416'" />
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

                    <template v-for="name in ['skin', 'hair', 'shirt', 'pants']" :key="name">
                        <label v-if="selectedTemplate.hasComponent(name)" class="form-field avatar-component-field">
                            <span class="form-label">{{ name }}</span>
                            <span class="avatar-component-controls">
                                <select v-model="appearance[name]" class="form-select">
                                    <option v-for="opt in selectedTemplate.getComponent(name).options" :key="opt" :value="opt">{{ opt }}</option>
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

                    <div class="form-field" v-if="selectedTemplate.hasComponent('accessories')">
                        <span class="form-label">Accessories</span>
                        <div class="avatar-accessory-list">
                            <label v-for="opt in selectedTemplate.getComponent('accessories').options" :key="opt" class="avatar-accessory-option">
                                <input
                                    type="checkbox"
                                    :checked="isAccessorySelected('accessories', opt)"
                                    @change="toggleAccessory('accessories', opt)"
                                />
                                {{ opt }}
                            </label>
                        </div>
                    </div>

                    <label class="form-field">
                        <span class="form-label">Display name</span>
                        <input v-model="displayName" type="text" class="form-input" maxlength="60" />
                    </label>

                    <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                    <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">Saved.</p>

                    <button class="action-btn action-btn--primary" @click="save" :disabled="saveStatus === 'saving'">Save</button>
                </div>
            </div>
        </section>
    `
};
