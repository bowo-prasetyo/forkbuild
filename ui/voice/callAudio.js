// The one <audio> a call's other voice plays through, for the whole app
// (ui/main.js builds it with the network runtime). It once lived on the
// friend's Chat page, so leaving that page for World View kept the call
// connected but silent; held here, the call is heard wherever you go.
//
// Follows application/chat/VoiceUseCase.js: whenever the device's one call
// changes state, the element plays that call's remote stream, or nothing.
// The speaker choice (setSinkId) is the element's, never VoiceUseCase's,
// as that file's header says.
export function createCallAudio(voiceUseCase, { createElement = defaultElement } = {}) {
    const audio = createElement();
    audio.autoplay = true;

    function follow() {
        const call = voiceUseCase.getActiveCall();
        const stream = call ? voiceUseCase.getRemoteStream(call.callId) : null;
        if (audio.srcObject === stream) return;
        audio.srcObject = stream;
        // A call is answered or placed with a click, so playing is allowed;
        // a browser that still refuses leaves the call connected, as before.
        if (stream && typeof audio.play === 'function') audio.play()?.catch?.(() => {});
    }

    const unsubscribeState = voiceUseCase.onCallStateChanged(() => follow());
    const unsubscribeIncoming = voiceUseCase.onIncomingCall(() => follow());
    follow();

    return {
        element: audio,
        canChooseSpeaker: () => typeof audio.setSinkId === 'function',
        setSpeaker: (deviceId) => audio.setSinkId(deviceId),
        stop() {
            unsubscribeState();
            unsubscribeIncoming();
            audio.srcObject = null;
            audio.remove?.();
        }
    };
}

// Kept in the page, out of sight, so every browser plays it.
function defaultElement() {
    const audio = document.createElement('audio');
    audio.className = 'call-audio';
    audio.hidden = true;
    document.body.appendChild(audio);
    return audio;
}
