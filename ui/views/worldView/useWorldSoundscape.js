import { ref } from 'vue';

// World View's ambient sound: made once the session has started, heard at the
// local avatar (or the camera, for a spectator), and toggled with M or the
// sound button. Absent when the app provides no soundscape factory.
export function useWorldSoundscape({ createWorldSoundscape, session }) {
    const soundAvailable = ref(false);
    const soundMuted = ref(false);
    const soundVolume = ref(0.5);
    let soundscape = null;

    function applySettings(settings) {
        soundMuted.value = settings.muted;
        soundVolume.value = settings.volume;
    }

    // Browsers only let audio start from a user gesture, and iOS can suspend
    // it again later, so every tap and key press offers to resume it.
    function unlockSound() {
        if (soundscape) {
            soundscape.unlock();
        }
    }

    function startSound() {
        if (typeof createWorldSoundscape !== 'function' || soundscape) {
            return;
        }
        soundscape = createWorldSoundscape({
            listenerPosition: () => session.getAvatarPosition() || session.getCameraPosition(),
            seed: session.getWorldSeed()
        });
        applySettings(soundscape.settings());
        soundscape.start();
        soundAvailable.value = true;
        window.addEventListener('pointerdown', unlockSound, true);
        window.addEventListener('keydown', unlockSound, true);
    }

    function stopSound() {
        window.removeEventListener('pointerdown', unlockSound, true);
        window.removeEventListener('keydown', unlockSound, true);
        if (soundscape) {
            soundscape.dispose();
            soundscape = null;
        }
        soundAvailable.value = false;
    }

    function toggleSound() {
        if (soundscape) {
            applySettings(soundscape.toggleMuted());
        }
    }

    function setSoundVolume(volume) {
        if (soundscape) {
            applySettings(soundscape.setVolume(volume));
        }
    }

    // M without modifiers toggles sound. Returns whether it handled the key.
    function onSoundKeyDown(event) {
        if (!soundscape || event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== 'm') {
            return false;
        }
        event.preventDefault();
        if (!event.repeat) {
            toggleSound();
        }
        return true;
    }

    return {
        soundAvailable, soundMuted, soundVolume,
        startSound, stopSound, toggleSound, setSoundVolume, onSoundKeyDown
    };
}
