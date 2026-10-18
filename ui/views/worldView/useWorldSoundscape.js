import { useSoundControls } from '../../composables/useSoundControls.js';

// World View's sound: made once the session has started, heard at the local
// avatar (or the camera, for a spectator), with the avatar's own footsteps,
// jumps, landings and engine, the animals, residents and other players
// around it (in 3D unless turned off) and the changes you make to a World,
// with crickets instead of birds after dark, more birdsong in spring and a
// hush in winter, and toggled with M or the sound
// button.
// Absent when the app provides no soundscape factory.
export function useWorldSoundscape({ createWorldSoundscape, session }) {
    return useSoundControls(() => (typeof createWorldSoundscape === 'function'
        ? createWorldSoundscape({
            listenerPosition: () => session.getAvatarPosition() || session.getCameraPosition(),
            seed: session.getWorldSeed(),
            avatarObservation: () => session.avatarSoundObservation(),
            creatureObservation: () => session.creatureSoundObservation(),
            listenerPose: () => session.soundListenerPose(),
            onRenderFrame: (callback) => session.onRenderFrame(callback),
            onCommandActivity: (listener) => session.onCommandActivity(listener),
            nightLevel: () => session.nightLevel(),
            rainLevel: () => (typeof session.weather === 'function' ? session.weather().rain || 0 : 0),
            sheltered: () => (typeof session.isSheltered === 'function' ? session.isSheltered() : false),
            season: () => (typeof session.season === 'function' ? session.season() : null),
            weatherClock: () => (typeof session.weatherClock === 'function' ? session.weatherClock() : null),
            thunderBetween: (from, to) => (typeof session.thunderBetween === 'function' ? session.thunderBetween(from, to) : [])
        })
        : null));
}
