import { ref, computed, onMounted } from 'vue';

// The shared read / Save / clear lifecycle behind every Network Settings
// endpoint page (Arweave Gateway, IPFS Gateway, IPFS Node, Bitcoin Endpoint,
// Nostr Relays, STUN, TURN, Rendezvous). Each page still injects its own
// store and write use case and owns its own input refs and template; this
// composable only removes the identical state handling they all repeated.
//
//   store      the injected configuration store — read via get(), cleared
//              via clear(). Never save()d here: every write goes through
//              `useCase`, whose value-object construction is the one place
//              an entry is validated.
//   useCase    the injected Set…ConfigurationUseCase; `execute(request)`
//              returns the persisted configuration or throws.
//   buildRequest()          the page's inputs as the use case's request, or
//                           null when there is nothing to save yet.
//   fillInputs(configuration)  writes a configuration (or null, meaning
//                           "nothing on file") back into the page's inputs.
//
// OPENING A PAGE NEVER WRITES ANYTHING — load() only reads store.get(), so
// merely visiting can never turn "no override" into a persisted one. The
// clear action calls store.clear(), never a save of the default value, so
// "no preference" is never recorded as an explicit preference that happens
// to match the default. A change takes effect on the next application load:
// ui/main.js reads each store once at startup.
//
// Every use case is synchronous, so there is no in-flight "saving" state.
export function useEndpointSettingsForm({ store, useCase, buildRequest, fillInputs }) {
    // The configuration currently on file, or null — read straight from the
    // store, never constructed here.
    const configuration = ref(null);
    const saveError = ref(null);
    const saveStatus = ref('idle'); // 'idle' | 'saved'
    const clearStatus = ref('idle'); // 'idle' | 'cleared'

    const hasConfiguration = computed(() => configuration.value !== null);

    // Re-reads the store fresh on every mount, so a newly mounted page
    // always observes whatever a prior instance (or a prior application
    // run) actually persisted.
    function load() {
        if (!store) return;
        configuration.value = store.get();
        fillInputs(configuration.value);
    }

    function save() {
        if (!useCase) return;
        const request = buildRequest();
        if (!request) return;
        saveError.value = null;
        clearStatus.value = 'idle';
        try {
            configuration.value = useCase.execute(request);
            fillInputs(configuration.value);
            saveStatus.value = 'saved';
        } catch (error) {
            // The use case threw before anything was persisted — whatever
            // was previously on file (if anything) remains untouched.
            saveStatus.value = 'idle';
            saveError.value = error.message;
        }
    }

    function clear() {
        if (!store) return;
        store.clear();
        configuration.value = null;
        fillInputs(null);
        saveError.value = null;
        saveStatus.value = 'idle';
        clearStatus.value = 'cleared';
    }

    onMounted(load);

    return { configuration, hasConfiguration, saveError, saveStatus, clearStatus, save, clear };
}
