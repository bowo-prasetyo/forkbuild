import { createCallAudio } from '../ui/voice/callAudio.js';
import { VoiceSessionState } from '../core/social/VoiceSessionState.js';
import { fakeVoiceUseCase } from './support/FakeVoiceUseCase.js';
import { assert } from './support/Assert.js';

// A call's voice plays through one app-wide element (ui/voice/callAudio.js),
// not the Chat page's, so it goes on while you walk together in World View.

function fakeElement() {
    return {
        srcObject: null,
        played: 0,
        sinks: [],
        play() { this.played += 1; return Promise.resolve(); },
        setSinkId(deviceId) { this.sinks.push(deviceId); return Promise.resolve(); }
    };
}

{
    const voice = fakeVoiceUseCase();
    const element = fakeElement();
    const audio = createCallAudio(voice, { createElement: () => element });
    assert(element.autoplay === true && element.srcObject === null, 'with no call, it plays nothing');

    voice.ring('did:key:friend');
    assert(element.srcObject === null, 'a ringing call has no voice yet');
    voice.to(VoiceSessionState.CONNECTING);
    const theirVoice = { id: 'their-voice' };
    voice.to(VoiceSessionState.ACTIVE, {}, theirVoice);
    assert(element.srcObject === theirVoice && element.played === 1, 'once the call is on, it plays their voice');
    voice.to(VoiceSessionState.ACTIVE, {}, theirVoice);
    assert(element.played === 1, 'and the same voice again is left playing');

    assert(audio.canChooseSpeaker(), 'a speaker can be chosen where the browser allows it');
    audio.setSpeaker('headphones');
    assert(element.sinks.join() === 'headphones', 'on this element, not the call');

    voice.to(VoiceSessionState.ENDED, { reason: 'REMOTE_HANGUP' });
    assert(element.srcObject === null, 'when the call ends, it goes quiet');

    audio.stop();
    assert(voice.listeners.state.size === 0 && voice.listeners.incoming.size === 0, 'stopping it stops listening');
    console.log('✓ the call audio plays the call\'s voice from answer to hang-up, wherever you are');
}

{
    const voice = fakeVoiceUseCase();
    const element = { srcObject: null, play: () => Promise.reject(new Error('NotAllowedError')) };
    const audio = createCallAudio(voice, { createElement: () => element });
    voice.ring('did:key:friend');
    voice.to(VoiceSessionState.ACTIVE, {}, { id: 'voice' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(element.srcObject !== null, 'a browser that refuses to play leaves the call as it is');
    assert(!audio.canChooseSpeaker(), 'and without setSinkId there is no speaker choice');
    console.log('✓ a refused play or a browser with no speaker choice changes nothing else');
}

console.log('✅ All call audio tests passed.');
