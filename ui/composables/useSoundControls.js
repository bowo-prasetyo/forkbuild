import { ref } from 'vue';

// The sound button, volume slider and M key shared by World View and the
// Editor. `createSound()` makes the view's sound service (start(), unlock(),
// settings(), toggleMuted(), setVolume(), dispose()), or returns null when the
// app provides none, in which case no control is shown.
export function useSoundControls(createSound) {
    const soundAvailable = ref(false);
    const soundMuted = ref(false);
    const soundVolume = ref(0.5);
    const soundSpatial = ref(true);
    let service = null;

    function applySettings(settings) {
        soundMuted.value = settings.muted;
        soundVolume.value = settings.volume;
        soundSpatial.value = settings.spatial;
    }

    // Browsers only let audio start from a user gesture, and iOS can suspend
    // it again later, so every tap and key press offers to resume it.
    function unlockSound() {
        if (service) {
            service.unlock();
        }
    }

    function startSound() {
        if (service) {
            return;
        }
        service = createSound();
        if (!service) {
            return;
        }
        applySettings(service.settings());
        service.start();
        soundAvailable.value = true;
        window.addEventListener('pointerdown', unlockSound, true);
        window.addEventListener('keydown', unlockSound, true);
    }

    function stopSound() {
        window.removeEventListener('pointerdown', unlockSound, true);
        window.removeEventListener('keydown', unlockSound, true);
        if (service) {
            service.dispose();
            service = null;
        }
        soundAvailable.value = false;
    }

    function toggleSound() {
        if (service) {
            applySettings(service.toggleMuted());
        }
    }

    function setSoundVolume(volume) {
        if (service) {
            applySettings(service.setVolume(volume));
        }
    }

    function toggleSoundSpatial() {
        if (service) {
            applySettings(service.toggleSpatial());
        }
    }

    // M without modifiers toggles sound. Returns whether it handled the key.
    function onSoundKeyDown(event) {
        if (!service || event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== 'm') {
            return false;
        }
        event.preventDefault();
        if (!event.repeat) {
            toggleSound();
        }
        return true;
    }

    // The running sound service, or null.
    function sound() {
        return service;
    }

    return {
        soundAvailable, soundMuted, soundVolume, soundSpatial,
        startSound, stopSound, toggleSound, setSoundVolume, toggleSoundSpatial, onSoundKeyDown, sound
    };
}
