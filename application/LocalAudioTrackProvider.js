// 0.2.73 — Authenticated Voice / Audio.
//
// The one place this codebase asks the platform for a real microphone.
// Deliberately its own tiny class, injectable into
// application/VoiceUseCase.js exactly the way storage/StorageProvider.js
// is injected everywhere else — see that class's own precedent. Keeping
// "how do I get a local audio track" completely separate from
// VoiceUseCase's own call-lifecycle/authorization logic is what lets a
// test substitute a synthetic track (a Web Audio oscillator routed into
// a MediaStreamDestination — no real microphone or OS permission prompt
// involved) without VoiceUseCase itself ever knowing the difference —
// see tests/AuthenticatedVoice.test.js's own header.
//
// A local audio track is deliberately never requested until a call is
// actually being placed or accepted — see application/VoiceUseCase.js's
// own header, "Local Media Is Requested Only Once A Call Is Actually
// Happening." This class has no "pre-warm the microphone" mode.
export class LocalAudioTrackProvider {
    constructor({ mediaDevices = (typeof navigator !== 'undefined' ? navigator.mediaDevices : null) } = {}) {
        this._mediaDevices = mediaDevices;
        this._streamsByTrack = new WeakMap();
    }

    // Resolves with one live audio MediaStreamTrack. Throws (never
    // silently returns null) if this environment has no microphone
    // access at all — application/VoiceUseCase.js surfaces that as a
    // failed call start/accept, exactly like a missing local signing
    // identity already fails peer/PeerAuthenticationSession.js#start().
    async getLocalAudioTrack() {
        if (!this._mediaDevices || typeof this._mediaDevices.getUserMedia !== 'function') {
            throw new Error('LocalAudioTrackProvider: no microphone access is available in this environment');
        }
        const stream = await this._mediaDevices.getUserMedia({ audio: true, video: false });
        const [track] = stream.getAudioTracks();
        if (!track) {
            throw new Error('LocalAudioTrackProvider: no audio track was returned by getUserMedia');
        }
        this._streamsByTrack.set(track, stream);
        return track;
    }

    // Stops the track AND every sibling track on the MediaStream it came
    // from (getUserMedia's own stream, never shared with anything else
    // in this codebase) — releasing the microphone indicator promptly
    // rather than leaving it held by an orphaned stream reference. A
    // no-op for a track this provider did not itself hand out (e.g. a
    // test's own synthetic track, which manages its own lifecycle).
    releaseTrack(track) {
        if (!track) {
            return;
        }
        const stream = this._streamsByTrack.get(track);
        if (stream) {
            for (const streamTrack of stream.getTracks()) {
                streamTrack.stop();
            }
            this._streamsByTrack.delete(track);
        } else {
            track.stop();
        }
    }
}
