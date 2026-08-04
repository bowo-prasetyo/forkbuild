// The one event DocumentManager publishes: its DocumentState just
// changed (dirty toggled, saved, loaded, closed, or a new document
// started). Only DocumentManager ever references this constant directly
// — ui/ subscribes through DocumentManager.onStateChanged(), never by
// importing this file itself, the same wrapper pattern PaletteUseCase
// uses for ActiveBrickChanged. That keeps ui/ from needing to know this
// vocabulary exists at all.
export const DocumentManagerEvent = Object.freeze({
    STATE_CHANGED: 'DocumentStateChanged'
});
