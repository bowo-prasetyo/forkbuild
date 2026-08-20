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
//
// 0.2.75 — Voice UX & Device Controls adds exactly one new capability to
// this boundary: WHICH input device to ask the platform for.
// `getLocalAudioTrack()` below takes an optional `deviceId` (a plain
// `MediaDeviceInfo#deviceId` string, never anything this class
// interprets), and `listInputDevices()` answers "what could I ask for" —
// both still the same "one place this codebase asks the platform for
// audio" boundary 0.2.73 already established, never duplicated
// elsewhere. Deliberately does NOT grow an output-device method: which
// SPEAKER plays the remote party's audio is never something a
// microphone provider — or application/VoiceUseCase.js, one layer up —
// has any business deciding; see that file's own header on why output
// selection stays entirely a UI/platform concern.
export class LocalAudioTrackProvider {
    constructor({ mediaDevices = (typeof navigator !== 'undefined' ? navigator.mediaDevices : null) } = {}) {
        this._mediaDevices = mediaDevices;
        this._streamsByTrack = new WeakMap();
    }

    // Resolves with one live audio MediaStreamTrack from `deviceId` — or
    // the platform's own default input if `deviceId` is null/omitted,
    // exactly 0.2.73's original behavior, unchanged for every existing
    // caller that never passes one. Throws (never silently returns null)
    // if this environment has no microphone access at all, OR if
    // `deviceId` no longer names a device the platform recognizes (e.g.
    // it was unplugged since it was listed) — application/VoiceUseCase.js
    // surfaces either as a failed call start/accept or a failed device
    // switch, exactly like a missing local signing identity already
    // fails peer/PeerAuthenticationSession.js#start().
    async getLocalAudioTrack(deviceId = null) {
        if (!this._mediaDevices || typeof this._mediaDevices.getUserMedia !== 'function') {
            throw new Error('LocalAudioTrackProvider: no microphone access is available in this environment');
        }
        const audioConstraint = deviceId ? { deviceId: { exact: deviceId } } : true;
        const stream = await this._mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
        const [track] = stream.getAudioTracks();
        if (!track) {
            throw new Error('LocalAudioTrackProvider: no audio track was returned by getUserMedia');
        }
        this._streamsByTrack.set(track, stream);
        return track;
    }

    // "What input devices could I ask getLocalAudioTrack() for?" — a
    // plain `[{ deviceId, label }]` list, never anything requiring an
    // active call or an already-acquired track (enumerateDevices() needs
    // neither). Resolves to `[]` rather than throwing in an environment
    // with no device-enumeration support at all — a UI degrades to "no
    // device picker," never a hard error, mirroring
    // application/VoiceUseCase.js#supportsVoice()'s own "answer honestly,
    // don't throw" precedent for a capability question.
    async listInputDevices() {
        if (!this._mediaDevices || typeof this._mediaDevices.enumerateDevices !== 'function') {
            return [];
        }
        const devices = await this._mediaDevices.enumerateDevices();
        return devices
            .filter((d) => d.kind === 'audioinput')
            .map((d) => ({ deviceId: d.deviceId, label: d.label }));
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
