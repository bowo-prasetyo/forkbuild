import { computed, inject, ref } from 'vue';
import { availableLocales, currentLocale, t } from '../i18n/i18n.js';
import { findLocale, negotiateLocale } from '../i18n/locales.js';
import { sortOptionsByLabel } from '../../utils/sortOptionsByLabel.js';

// Chooses the language ForkBuild shows on this device. Saving reloads the
// page rather than switching in place (see ui/i18n/i18n.js). Each language is
// listed by its own name, so it can be found whatever is showing now.
const AUTOMATIC = '';

export default {
    name: 'LanguageSettingsView',
    setup() {
        const languageSettingsStore = inject('languageSettingsStore', null);
        const reload = inject('reloadPage', () => window.location.reload());

        const saved = languageSettingsStore ? languageSettingsStore.get().locale : null;
        const selected = ref(findLocale(saved) ? findLocale(saved).code : AUTOMATIC);
        const browserLocale = findLocale(negotiateLocale(null, navigator.languages));

        const languages = computed(() => sortOptionsByLabel(
            availableLocales().filter((locale) => !locale.pseudo).map((locale) => ({ value: locale.code, label: locale.name }))
        ));
        const translatorLocales = computed(() => availableLocales()
            .filter((locale) => locale.pseudo)
            .map((locale) => ({ value: locale.code, label: locale.name })));
        const showsPseudo = computed(() => Boolean(currentLocale().pseudo));
        const changed = computed(() => selected.value !== (findLocale(saved) ? findLocale(saved).code : AUTOMATIC));

        function save() {
            if (!languageSettingsStore) {
                return;
            }
            languageSettingsStore.save({ locale: selected.value === AUTOMATIC ? null : selected.value });
            reload();
        }

        return {
            t, AUTOMATIC, selected, languages, translatorLocales, browserLocale, showsPseudo, changed, save,
            available: Boolean(languageSettingsStore),
            currentName: currentLocale().name
        };
    },
    template: `
        <section class="language-settings-view">
            <h1>{{ t('language.title') }}</h1>
            <p class="form-hint form-hint--neutral">{{ t('language.intro') }}</p>
            <p v-if="!available" class="form-hint">{{ t('language.unavailable') }}</p>
            <div v-else class="language-settings-form">
                <p class="form-hint form-hint--neutral">{{ t('language.current', { language: currentName }) }}</p>
                <label class="form-label" for="language-settings-select">{{ t('language.label') }}</label>
                <select id="language-settings-select" v-model="selected" class="form-select">
                    <option :value="AUTOMATIC">{{ t('language.automatic', { language: browserLocale.name }) }}</option>
                    <option v-for="option in languages" :key="option.value" :value="option.value">{{ option.label }}</option>
                    <optgroup :label="t('language.forTranslators')">
                        <option v-for="option in translatorLocales" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </optgroup>
                </select>
                <p class="form-hint form-hint--neutral">{{ t('language.reloadNote') }}</p>
                <p v-if="showsPseudo" class="form-hint form-hint--neutral">{{ t('language.pseudoNote') }}</p>
                <button type="button" class="action-btn action-btn--primary" :disabled="!changed" @click="save">{{ t('language.save') }}</button>
                <p class="form-hint form-hint--neutral">{{ t('language.helpTranslate') }}</p>
            </div>
        </section>
    `
};
