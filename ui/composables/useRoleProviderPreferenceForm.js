import { ref, onMounted } from 'vue';

// The shared load / Save lifecycle behind the three role-provider settings
// pages (Content, Announcement / Discovery, Proof / Anchoring). Each page
// still injects the store and write use case itself, hardcodes its own one
// role, and builds its own option list; this composable only removes the
// identical preference handling they all repeated.
//
// It NEVER CONSTRUCTS OR INTERPRETS A RoleProviderPreference. It reads one
// back from `preferenceStore.get(role)` only to preselect the radio group,
// and saves through `setUseCase.execute({ role, providerKey })` — never
// `new RoleProviderPreference(...)`, never the store's own save().
//
// `isSelectable(providerKey)` lets a page decline to preselect a stored key
// it no longer offers (the Content page's legacy `local` preference), so
// that key is shown as "nothing selected" rather than as a radio button
// that does not exist.
export function useRoleProviderPreferenceForm({ role, preferenceStore, setUseCase, isSelectable = () => true }) {
    const preference = ref(null);
    const selectedProviderKey = ref(null);
    const saveError = ref(null);
    const saveStatus = ref('idle'); // 'idle' | 'saved'

    // Re-reads the store fresh on every mount, so a newly mounted page
    // observes whatever a prior instance (or ui/main.js's own boot-time
    // read) most recently persisted.
    function load() {
        if (!preferenceStore) return;
        preference.value = preferenceStore.get(role);
        const key = preference.value ? preference.value.providerKey : null;
        selectedProviderKey.value = key && isSelectable(key) ? key : null;
    }

    function save() {
        if (!setUseCase || !selectedProviderKey.value) return;
        saveError.value = null;
        try {
            preference.value = setUseCase.execute({ role, providerKey: selectedProviderKey.value });
            saveStatus.value = 'saved';
        } catch (error) {
            saveStatus.value = 'idle';
            saveError.value = error.message;
        }
    }

    onMounted(load);

    return { preference, selectedProviderKey, saveError, saveStatus, save };
}
