import { useSoundControls } from '../../composables/useSoundControls.js';

// World View's sound: made once the session has started, heard at the local
// avatar (or the camera, for a spectator), with the avatar's own footsteps,
// jumps, landings and engine, the animals and residents around it and the
// changes you make to a World, and toggled with M or the sound button. Absent when the app provides no
// soundscape factory.
export function useWorldSoundscape({ createWorldSoundscape, session }) {
    return useSoundControls(() => (typeof createWorldSoundscape === 'function'
        ? createWorldSoundscape({
            listenerPosition: () => session.getAvatarPosition() || session.getCameraPosition(),
            seed: session.getWorldSeed(),
            avatarObservation: () => session.avatarSoundObservation(),
            creatureObservation: () => session.creatureSoundObservation(),
            onRenderFrame: (callback) => session.onRenderFrame(callback),
            onCommandActivity: (listener) => session.onCommandActivity(listener)
        })
        : null));
}
